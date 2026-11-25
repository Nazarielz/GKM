import os
import json
import httpx
import hashlib
import io
import re
import secrets
import sqlite3
import time

from pathlib import Path
from dotenv import load_dotenv

from pydantic import BaseModel, Field
from eth_account import Account
from eth_account.messages import encode_defunct

from fastapi import (
    FastAPI,
    UploadFile,
    File,
    Form,
    HTTPException,
    Header,
)

from fastapi.middleware.cors import CORSMiddleware

from PIL import Image, UnidentifiedImageError

from app.database import init_db, get_connection
from app.services.ai_classifier import predict_image

# ==========================================
# 1. KONFIGURASI
# ==========================================

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")

PINATA_JWT = os.getenv("PINATA_JWT")

PINATA_UPLOAD_URL = "https://uploads.pinata.cloud/v3/files"

ADMIN_WALLET_ADDRESS = os.getenv("ADMIN_WALLET_ADDRESS", "").lower()

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}

MAX_FILE_SIZE = 10 * 1024 * 1024

ADMIN_SESSION_DURATION = 30 * 60
ADMIN_NONCE_DURATION = 300

# Penyimpanan sesi sementara selama backend aktif.
# Untuk pengembangan lokal.
admin_login_nonces = {}
admin_sessions = {}


# ==========================================
# 2. UTILITAS WALLET DAN ADMIN
# ==========================================

WALLET_PATTERN = re.compile(r"^0x[a-fA-F0-9]{40}$")


def validate_wallet(wallet_address):

    if not WALLET_PATTERN.fullmatch(wallet_address):
        raise HTTPException(status_code=400, detail="Alamat wallet tidak valid")


def create_admin_login_message(wallet_address, nonce):

    return (
        "Galeri Karya Admin Login\n"
        f"Wallet: {wallet_address.lower()}\n"
        f"Nonce: {nonce}\n"
        "Purpose: Authenticate administrator access.\n"
        "This signature does not authorize a blockchain transaction."
    )


def verify_admin_session(authorization: str):

    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Sesi administrator tidak ditemukan. Silakan login kembali.",
        )

    token = authorization[7:].strip()

    session = admin_sessions.get(token)

    if not session:
        raise HTTPException(
            status_code=401,
            detail="Sesi administrator tidak valid. Silakan login kembali.",
        )

    if time.time() > session["expires_at"]:

        admin_sessions.pop(token, None)

        raise HTTPException(
            status_code=401,
            detail="Sesi administrator telah berakhir. Silakan login kembali.",
        )

    if session["wallet"] != ADMIN_WALLET_ADDRESS:

        admin_sessions.pop(token, None)

        raise HTTPException(
            status_code=403, detail="Wallet tidak memiliki akses administrator."
        )

    return session["wallet"]


# ==========================================
# 3. MODEL REQUEST
# ==========================================


class CreatorRegistration(BaseModel):

    full_name: str = Field(min_length=2, max_length=100)

    username: str = Field(min_length=3, max_length=30)

    email: str = Field(min_length=5, max_length=150)

    description: str = Field(default="", max_length=1000)

    wallet_address: str
    nonce: str
    signature: str


class AdminLoginRequest(BaseModel):

    wallet_address: str
    nonce: str
    signature: str


class AdminApprovalRequest(BaseModel):

    wallet_address: str
    transaction_hash: str


class AdminRejectionRequest(BaseModel):

    wallet_address: str

    reason: str = Field(min_length=3, max_length=500)


# ==========================================
# 4. FASTAPI
# ==========================================

app = FastAPI(
    title="Galeri Karya API",
    description="Backend DApp Galeri Karya Multimedia",
    version="1.0.0",
)


@app.on_event("startup")
def startup_event():

    init_db()


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==========================================
# 5. ENDPOINT DASAR
# ==========================================


@app.get("/")
def root():

    return {"message": "Galeri Karya API aktif"}


@app.get("/health")
def health():

    return {"status": "ok"}


# ==========================================
# 5A. MENGAMBIL METADATA DARI IPFS
# DENGAN CACHE DAN TIMEOUT
# ==========================================

# Cache metadata selama 30 menit
METADATA_CACHE = {}
METADATA_CACHE_DURATION = 1800


@app.get("/api/ipfs/metadata/{cid}")
async def get_ipfs_metadata(cid: str):

    # 1. Validasi CID
    if not re.fullmatch(r"(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})", cid):
        raise HTTPException(status_code=400, detail="CID IPFS tidak valid.")

    # 2. Periksa cache
    cached = METADATA_CACHE.get(cid)

    if cached:
        metadata, cached_at = cached

        if time.time() - cached_at < METADATA_CACHE_DURATION:
            print(f"Metadata diambil dari cache: {cid}")
            return metadata

        # Cache kedaluwarsa
        METADATA_CACHE.pop(cid, None)

    # 3. Daftar gateway IPFS
    gateways = [
        f"https://gateway.pinata.cloud/ipfs/{cid}",
        f"https://dweb.link/ipfs/{cid}",
        f"https://ipfs.io/ipfs/{cid}",
    ]

    errors = []

    # 4. Coba gateway dengan timeout 5 detik
    timeout = httpx.Timeout(5.0, connect=3.0)

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:

        for gateway in gateways:

            try:
                print(f"Mencoba gateway: {gateway}")

                response = await client.get(gateway)
                response.raise_for_status()

                metadata = response.json()

                if not isinstance(metadata, dict):
                    raise ValueError("Format metadata tidak valid.")

                # 5. Simpan metadata ke cache
                METADATA_CACHE[cid] = (metadata, time.time())

                print(f"Metadata berhasil dimuat: {cid}")

                return metadata

            except (httpx.HTTPError, ValueError) as error:

                errors.append(str(error))

                print(f"Gateway gagal: {gateway} - {error}")

    # 6. Semua gateway gagal
    raise HTTPException(
        status_code=502,
        detail={
            "message": "Metadata tidak dapat diakses dari seluruh gateway IPFS.",
            "errors": errors,
        },
    )


# ==========================================
# 6. AI CLASSIFICATION
# ==========================================


@app.post("/api/ai/predict")
async def classify_artwork(file: UploadFile = File(...)):

    if file.content_type not in ALLOWED_TYPES:

        raise HTTPException(
            status_code=400, detail="Format file harus JPG, PNG, atau WEBP"
        )

    file_data = await file.read(MAX_FILE_SIZE + 1)

    if not file_data:

        raise HTTPException(status_code=400, detail="File tidak boleh kosong")

    if len(file_data) > MAX_FILE_SIZE:

        raise HTTPException(status_code=400, detail="Ukuran file maksimal 10 MB")

    try:

        with Image.open(io.BytesIO(file_data)) as image:
            image.verify()

    except (UnidentifiedImageError, OSError, ValueError):

        raise HTTPException(
            status_code=400, detail="File gambar rusak atau tidak valid."
        )

    try:

        result = predict_image(file_data)

        return {
            "success": True,
            "message": "Klasifikasi karya berhasil",
            "model": "MobileNetV2",
            "recommendation": result,
        }

    except FileNotFoundError:

        raise HTTPException(status_code=503, detail="Model AI belum tersedia")

    except ValueError as error:

        raise HTTPException(status_code=400, detail=str(error))

    except Exception:

        raise HTTPException(
            status_code=500, detail="Terjadi kesalahan saat melakukan prediksi AI"
        )


# ==========================================
# 7. UPLOAD ARTWORK KE PINATA
# ==========================================


@app.post("/api/artworks/upload")
async def upload_artwork(
    title: str = Form(...),
    description: str = Form(...),
    category: str = Form(...),
    creator: str = Form(...),
    file: UploadFile = File(...),
):

    if not PINATA_JWT:

        raise HTTPException(status_code=500, detail="PINATA_JWT belum dikonfigurasi")

    if file.content_type not in ALLOWED_TYPES:

        raise HTTPException(
            status_code=400, detail="Format file harus JPG, PNG, atau WEBP"
        )

    file_data = await file.read(MAX_FILE_SIZE + 1)

    if not file_data:

        raise HTTPException(status_code=400, detail="File tidak boleh kosong")

    if len(file_data) > MAX_FILE_SIZE:

        raise HTTPException(status_code=400, detail="Ukuran file maksimal 10 MB")

    try:

        with Image.open(io.BytesIO(file_data)) as image:
            image.verify()

    except (UnidentifiedImageError, OSError, ValueError):

        raise HTTPException(
            status_code=400, detail="File gambar rusak atau tidak valid."
        )

    content_hash = "0x" + hashlib.sha256(file_data).hexdigest()

    headers = {"Authorization": f"Bearer {PINATA_JWT}"}

    try:

        async with httpx.AsyncClient(timeout=120.0) as client:

            # Upload gambar
            image_response = await client.post(
                PINATA_UPLOAD_URL,
                headers=headers,
                data={"network": "public", "name": file.filename or "artwork"},
                files={
                    "file": (file.filename or "artwork", file_data, file.content_type)
                },
            )

            image_response.raise_for_status()

            image_result = image_response.json()

            image_cid = image_result["data"]["cid"]

            # Metadata NFT
            metadata = {
                "name": title,
                "description": description,
                "image": f"ipfs://{image_cid}",
                "category": category,
                "creator": creator,
                "attributes": [{"trait_type": "Category", "value": category}],
            }

            metadata_json = json.dumps(metadata, ensure_ascii=False, indent=2).encode(
                "utf-8"
            )

            # Upload metadata
            metadata_response = await client.post(
                PINATA_UPLOAD_URL,
                headers=headers,
                data={"network": "public", "name": "metadata.json"},
                files={"file": ("metadata.json", metadata_json, "application/json")},
            )

            metadata_response.raise_for_status()

            metadata_result = metadata_response.json()

            metadata_cid = metadata_result["data"]["cid"]

            return {
                "success": True,
                "message": "Karya berhasil diunggah ke IPFS",
                "contentHash": content_hash,
                "artwork": {"title": title, "category": category, "creator": creator},
                "image": {"cid": image_cid, "uri": f"ipfs://{image_cid}"},
                "metadata": {"cid": metadata_cid, "uri": f"ipfs://{metadata_cid}"},
            }

    except httpx.HTTPStatusError as error:

        try:
            pinata_error = error.response.json()

        except ValueError:
            pinata_error = error.response.text[:500]

        print("PINATA STATUS:", error.response.status_code)
        print("PINATA ERROR:", pinata_error)

        raise HTTPException(
            status_code=502,
            detail=(
                f"Pinata menolak upload "
                f"(HTTP {error.response.status_code}). "
                "Periksa terminal backend."
            ),
        )

    except httpx.RequestError:

        raise HTTPException(
            status_code=502, detail="Tidak dapat terhubung ke layanan Pinata"
        )

    except (KeyError, ValueError):

        raise HTTPException(
            status_code=502,
            detail="Respons dari Pinata tidak sesuai format yang diharapkan",
        )


# ==========================================
# 8. REGISTRASI KREATOR
# ==========================================


def create_wallet_message(wallet_address, nonce):

    return (
        "Galeri Karya Creator Registration\n"
        f"Wallet: {wallet_address.lower()}\n"
        f"Nonce: {nonce}\n"
        "Purpose: Verify wallet ownership. "
        "This signature does not authorize a blockchain transaction."
    )


@app.get("/api/creators/nonce")
def get_creator_nonce(wallet_address: str):

    validate_wallet(wallet_address)

    wallet = wallet_address.lower()

    nonce = secrets.token_urlsafe(24)

    message = create_wallet_message(wallet, nonce)

    expires_at = time.time() + 300

    with get_connection() as connection:

        connection.execute(
            """
            INSERT INTO wallet_nonces (
                wallet_address,
                nonce,
                message,
                expires_at
            )
            VALUES (?, ?, ?, ?)
            ON CONFLICT(wallet_address)
            DO UPDATE SET
                nonce = excluded.nonce,
                message = excluded.message,
                expires_at = excluded.expires_at
            """,
            (wallet, nonce, message, expires_at),
        )

        connection.commit()

    return {"success": True, "message": message, "nonce": nonce, "expiresIn": 300}


@app.post("/api/creators/register")
def register_creator(data: CreatorRegistration):

    validate_wallet(data.wallet_address)

    wallet = data.wallet_address.lower()

    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", data.email.strip()):

        raise HTTPException(status_code=400, detail="Format email tidak valid")

    if not re.fullmatch(r"[a-zA-Z0-9_.-]+", data.username):

        raise HTTPException(
            status_code=400,
            detail=(
                "Username hanya boleh berisi huruf, angka, "
                "titik, garis bawah, atau tanda hubung"
            ),
        )

    with get_connection() as connection:

        nonce_record = connection.execute(
            """
            SELECT *
            FROM wallet_nonces
            WHERE wallet_address = ?
            AND nonce = ?
            """,
            (wallet, data.nonce),
        ).fetchone()

        if not nonce_record:

            raise HTTPException(
                status_code=400,
                detail=(
                    "Nonce tidak ditemukan atau sudah digunakan. "
                    "Silakan ulangi verifikasi wallet."
                ),
            )

        if time.time() > nonce_record["expires_at"]:

            connection.execute(
                """
                DELETE FROM wallet_nonces
                WHERE wallet_address = ?
                """,
                (wallet,),
            )

            connection.commit()

            raise HTTPException(
                status_code=400,
                detail="Kode verifikasi kedaluwarsa. Silakan coba kembali.",
            )

        try:

            recovered_address = Account.recover_message(
                encode_defunct(text=nonce_record["message"]), signature=data.signature
            )

        except Exception:

            raise HTTPException(
                status_code=400, detail="Tanda tangan MetaMask tidak valid"
            )

        if recovered_address.lower() != wallet:

            raise HTTPException(
                status_code=403, detail="Wallet tidak cocok dengan tanda tangan"
            )

        try:

            cursor = connection.execute(
                """
                INSERT INTO creator_registrations (
                    full_name,
                    username,
                    email,
                    description,
                    wallet_address,
                    status
                )
                VALUES (?, ?, ?, ?, ?, 'pending')
                """,
                (
                    data.full_name.strip(),
                    data.username.strip(),
                    data.email.strip(),
                    data.description.strip(),
                    wallet,
                ),
            )

            registration_id = cursor.lastrowid

            connection.execute(
                """
                DELETE FROM wallet_nonces
                WHERE wallet_address = ?
                """,
                (wallet,),
            )

            connection.commit()

        except sqlite3.IntegrityError:

            raise HTTPException(
                status_code=409, detail="Wallet, username, atau email sudah terdaftar"
            )

    return {
        "success": True,
        "message": "Pendaftaran kreator berhasil dikirim",
        "registration": {
            "id": registration_id,
            "walletAddress": wallet,
            "status": "pending",
        },
    }


@app.get("/api/creators/registration-status")
def creator_registration_status(wallet_address: str):

    validate_wallet(wallet_address)

    with get_connection() as connection:

        registration = connection.execute(
            """
            SELECT
                id,
                full_name,
                username,
                wallet_address,
                status,
                created_at
            FROM creator_registrations
            WHERE wallet_address = ?
            """,
            (wallet_address.lower(),),
        ).fetchone()

    if not registration:

        return {
            "registered": False,
            "message": "Wallet belum terdaftar sebagai kreator",
        }

    return {"registered": True, "registration": dict(registration)}


# ==========================================
# 9. ADMIN LOGIN SESSION
# ==========================================


@app.get("/api/admin/session/nonce")
def get_admin_login_nonce(wallet_address: str):

    validate_wallet(wallet_address)

    wallet = wallet_address.lower()

    if not ADMIN_WALLET_ADDRESS:

        raise HTTPException(
            status_code=500, detail="ADMIN_WALLET_ADDRESS belum dikonfigurasi."
        )

    if wallet != ADMIN_WALLET_ADDRESS:

        raise HTTPException(status_code=403, detail="Wallet ini bukan administrator.")

    nonce = secrets.token_urlsafe(32)

    message = create_admin_login_message(wallet, nonce)

    admin_login_nonces[wallet] = {
        "nonce": nonce,
        "message": message,
        "expires_at": time.time() + ADMIN_NONCE_DURATION,
    }

    return {
        "success": True,
        "message": message,
        "nonce": nonce,
        "expiresIn": ADMIN_NONCE_DURATION,
    }


@app.post("/api/admin/session/login")
def admin_login(data: AdminLoginRequest):

    validate_wallet(data.wallet_address)

    wallet = data.wallet_address.lower()

    if not ADMIN_WALLET_ADDRESS:

        raise HTTPException(
            status_code=500, detail="ADMIN_WALLET_ADDRESS belum dikonfigurasi."
        )

    if wallet != ADMIN_WALLET_ADDRESS:

        raise HTTPException(status_code=403, detail="Wallet bukan administrator.")

    nonce_record = admin_login_nonces.get(wallet)

    if not nonce_record:

        raise HTTPException(
            status_code=400, detail="Nonce login tidak ditemukan. Silakan ulangi."
        )

    if time.time() > nonce_record["expires_at"]:

        admin_login_nonces.pop(wallet, None)

        raise HTTPException(
            status_code=400, detail="Nonce login kedaluwarsa. Silakan ulangi."
        )

    if data.nonce != nonce_record["nonce"]:

        raise HTTPException(status_code=400, detail="Nonce login tidak cocok.")

    try:

        recovered_address = Account.recover_message(
            encode_defunct(text=nonce_record["message"]), signature=data.signature
        )

    except Exception:

        raise HTTPException(status_code=400, detail="Signature login tidak valid.")

    if recovered_address.lower() != wallet:

        raise HTTPException(
            status_code=403, detail="Signature tidak cocok dengan wallet administrator."
        )

    # Nonce hanya dapat digunakan satu kali.
    admin_login_nonces.pop(wallet, None)

    # Buat token acak untuk sesi administrator.
    token = secrets.token_urlsafe(48)

    expires_at = time.time() + ADMIN_SESSION_DURATION

    admin_sessions[token] = {"wallet": wallet, "expires_at": expires_at}

    return {
        "success": True,
        "message": "Login administrator berhasil.",
        "token": token,
        "wallet_address": wallet,
        "expires_in": ADMIN_SESSION_DURATION,
    }


@app.post("/api/admin/session/logout")
def admin_logout(authorization: str = Header(default="")):

    verify_admin_session(authorization)

    token = authorization[7:].strip()

    admin_sessions.pop(token, None)

    return {"success": True, "message": "Sesi administrator berhasil diakhiri."}


# ==========================================
# 10. ADMIN: DAFTAR SELURUH KREATOR
# ==========================================


@app.get("/api/admin/creators")
def get_all_creators(authorization: str = Header(default="")):

    verify_admin_session(authorization)

    with get_connection() as connection:

        registrations = connection.execute("""
            SELECT
                id,
                full_name,
                username,
                email,
                description,
                wallet_address,
                status,
                created_at
            FROM creator_registrations
            ORDER BY created_at DESC
            """).fetchall()

    return {
        "success": True,
        "total": len(registrations),
        "creators": [dict(row) for row in registrations],
    }


# ==========================================
# 11. ADMIN: MENYETUJUI KREATOR
# ==========================================


@app.post("/api/admin/creators/{registration_id}/approve")
def approve_creator(
    registration_id: int,
    data: AdminApprovalRequest,
    authorization: str = Header(default=""),
):

    verify_admin_session(authorization)

    validate_wallet(data.wallet_address)

    if not re.fullmatch(r"0x[a-fA-F0-9]{64}", data.transaction_hash):

        raise HTTPException(status_code=400, detail="Transaction hash tidak valid")

    with get_connection() as connection:

        registration = connection.execute(
            """
            SELECT *
            FROM creator_registrations
            WHERE id = ?
            """,
            (registration_id,),
        ).fetchone()

        if not registration:

            raise HTTPException(
                status_code=404, detail="Pendaftaran kreator tidak ditemukan"
            )

        if registration["status"] != "pending":

            raise HTTPException(
                status_code=409, detail="Pendaftaran bukan berstatus pending"
            )

        if registration["wallet_address"].lower() != data.wallet_address.lower():

            raise HTTPException(
                status_code=400, detail="Wallet tidak cocok dengan data pendaftaran"
            )

        connection.execute(
            """
            UPDATE creator_registrations
            SET status = 'approved'
            WHERE id = ?
            AND status = 'pending'
            """,
            (registration_id,),
        )

        connection.commit()

    return {
        "success": True,
        "message": "Kreator berhasil disetujui",
        "registration_id": registration_id,
        "wallet_address": data.wallet_address,
        "status": "approved",
        "transaction_hash": data.transaction_hash,
    }


# ==========================================
# 12. ADMIN: MENOLAK KREATOR
# ==========================================


@app.post("/api/admin/creators/{registration_id}/reject")
def reject_creator(
    registration_id: int,
    data: AdminRejectionRequest,
    authorization: str = Header(default=""),
):

    verify_admin_session(authorization)

    validate_wallet(data.wallet_address)

    with get_connection() as connection:

        registration = connection.execute(
            """
            SELECT *
            FROM creator_registrations
            WHERE id = ?
            """,
            (registration_id,),
        ).fetchone()

        if not registration:

            raise HTTPException(
                status_code=404, detail="Pendaftaran kreator tidak ditemukan"
            )

        if registration["status"] != "pending":

            raise HTTPException(
                status_code=409, detail="Pendaftaran bukan berstatus pending"
            )

        if registration["wallet_address"].lower() != data.wallet_address.lower():

            raise HTTPException(
                status_code=400, detail="Wallet tidak cocok dengan data pendaftaran"
            )

        connection.execute(
            """
            UPDATE creator_registrations
            SET status = 'rejected'
            WHERE id = ?
            AND status = 'pending'
            """,
            (registration_id,),
        )

        connection.commit()

    return {
        "success": True,
        "message": "Pendaftaran kreator berhasil ditolak",
        "registration_id": registration_id,
        "status": "rejected",
        "reason": data.reason.strip(),
    }
