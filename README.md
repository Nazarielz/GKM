# Galeri Karya Multimedia Berbasis AI dan Blockchain

Scaffold proyek akhir D4 Teknik Informatika Multimedia Polnes.

## Struktur
- `frontend/`: HTML, CSS, JavaScript, Vite, Ethers.js
- `backend/`: FastAPI untuk praproses dan inferensi AI
- `contracts/`: Solidity
- `test/`: Hardhat tests
- `scripts/`: deployment
- `docs/`: dokumentasi

## Prasyarat
Windows 10/11, Node.js LTS, npm, Python 3.10+, Git (disarankan), MetaMask.
Periksa: `node --version`, `npm --version`, `python --version`, `git --version`.

## Instalasi

### Root
```powershell
npm install
```

### Frontend
```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```
Buka alamat Vite, biasanya `http://127.0.0.1:5173`.

### Backend
Buka terminal PowerShell baru:
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
Jika aktivasi diblokir: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`, lalu aktifkan ulang.
Cek `http://127.0.0.1:8000/health` dan `/docs`.

### Hardhat lokal
Dari root: `npx hardhat compile`, `npx hardhat test`.
Node lokal di terminal terpisah: `npx hardhat node`.

## Jaringan
Hardhat lokal: chain ID 31337, RPC `http://127.0.0.1:8545`.
Sepolia: chain ID 11155111. Alamat kontrak lokal dan Sepolia harus dipisahkan.

## Keamanan
Jangan masukkan seed phrase, private key, atau API secret ke frontend. Jangan commit `.env`.
Backend AI tidak menandatangani transaksi. Gunakan wallet test khusus untuk Sepolia.

## Status scaffold
Kontrak, model AI, endpoint inferensi, IPFS, deployment, dan automated tests akan diimplementasikan bertahap. Scaffold ini belum merupakan aplikasi lengkap.
