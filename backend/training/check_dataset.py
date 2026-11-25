from pathlib import Path
from PIL import Image
import hashlib
import csv

# Lokasi proyek
PROJECT_ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = PROJECT_ROOT / "backend" / "ai" / "dataset" / "raw"
REPORT_FILE = PROJECT_ROOT / "backend" / "ai" / "dataset" / "quality_report.csv"

CLASSES = ["Ilustrasi", "Foto", "Poster"]
EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

records = []
hash_registry = {}

total_valid = 0
total_broken = 0
total_duplicate = 0

for class_name in CLASSES:
    class_dir = RAW_DIR / class_name

    print(f"\nMemeriksa kategori: {class_name}")

    if not class_dir.exists():
        print("Folder tidak ditemukan!")
        continue

    for path in sorted(class_dir.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in EXTENSIONS:
            continue

        relative_path = path.relative_to(PROJECT_ROOT).as_posix()

        try:
            # Memeriksa apakah gambar dapat dibuka
            with Image.open(path) as img:
                img.verify()

            # Membaca dimensi gambar
            with Image.open(path) as img:
                width, height = img.size

            # Menghitung hash file
            file_hash = hashlib.sha256(path.read_bytes()).hexdigest()

            duplicate_of = hash_registry.get(file_hash, "")
            status = "DUPLICATE" if duplicate_of else "VALID"

            if duplicate_of:
                total_duplicate += 1
                print(f"[DUPLIKAT] {path.name} -> {duplicate_of}")
            else:
                hash_registry[file_hash] = relative_path
                total_valid += 1

            records.append(
                {
                    "filepath": relative_path,
                    "category": class_name,
                    "width": width,
                    "height": height,
                    "status": status,
                    "duplicate_of": duplicate_of,
                }
            )

        except Exception as error:
            total_broken += 1
            print(f"[RUSAK] {path.name}: {error}")

            records.append(
                {
                    "filepath": relative_path,
                    "category": class_name,
                    "width": 0,
                    "height": 0,
                    "status": "BROKEN",
                    "duplicate_of": "",
                }
            )

# Menyimpan laporan
REPORT_FILE.parent.mkdir(parents=True, exist_ok=True)

fields = ["filepath", "category", "width", "height", "status", "duplicate_of"]

with open(REPORT_FILE, "w", newline="", encoding="utf-8-sig") as file:
    writer = csv.DictWriter(file, fieldnames=fields)
    writer.writeheader()
    writer.writerows(records)

print("\n================================")
print("HASIL PEMERIKSAAN DATASET")
print("================================")
print(f"Gambar valid       : {total_valid}")
print(f"Gambar rusak       : {total_broken}")
print(f"Gambar duplikat    : {total_duplicate}")
print(f"Total diperiksa    : {len(records)}")
print(f"Laporan            : {REPORT_FILE}")
