from pathlib import Path
import csv

# ==========================================
# 1. KONFIGURASI
# ==========================================

PROJECT_ROOT = Path(__file__).resolve().parents[2]

DATASET_DIR = PROJECT_ROOT / "backend" / "ai" / "dataset"
RAW_DIR = DATASET_DIR / "raw"

MANIFEST_FILE = DATASET_DIR / "manifest.csv"

CLASSES = ["Ilustrasi", "Foto", "Poster"]

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

# ==========================================
# 2. MEMERIKSA FOLDER
# ==========================================

DATASET_DIR.mkdir(parents=True, exist_ok=True)

if not RAW_DIR.exists():
    raise FileNotFoundError(f"Folder dataset tidak ditemukan: {RAW_DIR}")

# ==========================================
# 3. MEMBACA GAMBAR
# ==========================================

records = []

for class_name in CLASSES:

    class_dir = RAW_DIR / class_name

    if not class_dir.exists():
        print(f"[PERINGATAN] Folder tidak ditemukan: {class_name}")
        continue

    image_files = sorted(
        file
        for file in class_dir.rglob("*")
        if file.is_file() and file.suffix.lower() in IMAGE_EXTENSIONS
    )

    print(f"\nKategori: {class_name}")
    print(f"Jumlah gambar: {len(image_files)}")

    for image_path in image_files:

        relative_path = image_path.relative_to(PROJECT_ROOT)

        records.append(
            {
                "filepath": relative_path.as_posix(),
                "label": class_name,
                "source": "",
                "group_id": "",
                "split": "",
            }
        )

# ==========================================
# 4. MENYIMPAN MANIFEST CSV
# ==========================================

fields = ["filepath", "label", "source", "group_id", "split"]

with open(MANIFEST_FILE, "w", newline="", encoding="utf-8-sig") as file:

    writer = csv.DictWriter(file, fieldnames=fields)

    writer.writeheader()
    writer.writerows(records)

# ==========================================
# 5. RINGKASAN DATASET
# ==========================================

print("\n================================")
print("INVENTARIS DATASET SELESAI")
print("================================")

for class_name in CLASSES:

    total = sum(1 for record in records if record["label"] == class_name)

    print(f"{class_name}: {total} gambar")

print(f"\nTotal gambar: {len(records)}")
print(f"Manifest: {MANIFEST_FILE}")
