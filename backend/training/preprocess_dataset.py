from pathlib import Path
from PIL import Image, ImageOps
import csv

# ==========================================
# 1. KONFIGURASI
# ==========================================

PROJECT_ROOT = Path(__file__).resolve().parents[2]

RAW_DIR = PROJECT_ROOT / "backend" / "ai" / "dataset" / "raw"

OUTPUT_DIR = PROJECT_ROOT / "backend" / "ai" / "dataset" / "processed" / "mobilenetv2"

REPORT_FILE = PROJECT_ROOT / "backend" / "ai" / "dataset" / "preprocess_report.csv"

CLASSES = ["Ilustrasi", "Foto", "Poster"]

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

IMAGE_SIZE = (224, 224)

# ==========================================
# 2. PERSIAPAN FOLDER
# ==========================================

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

records = []

total_success = 0
total_failed = 0

# ==========================================
# 3. PROSES PREPROCESSING
# ==========================================

for class_name in CLASSES:

    class_dir = RAW_DIR / class_name
    output_class_dir = OUTPUT_DIR / class_name

    output_class_dir.mkdir(parents=True, exist_ok=True)

    print(f"\nMemproses kategori: {class_name}")

    if not class_dir.exists():
        print("[PERINGATAN] Folder tidak ditemukan.")
        continue

    image_files = sorted(
        path
        for path in class_dir.rglob("*")
        if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
    )

    for image_path in image_files:

        try:
            # Membuka gambar asli
            with Image.open(image_path) as image:

                original_size = image.size

                # Mengubah gambar menjadi RGB
                image = image.convert("RGB")

                # Resize tanpa mengubah rasio gambar
                image = ImageOps.contain(
                    image, IMAGE_SIZE, method=Image.Resampling.LANCZOS
                )

                # Membuat kanvas 224 x 224
                canvas = Image.new("RGB", IMAGE_SIZE, (255, 255, 255))

                # Meletakkan gambar di tengah kanvas
                x = (IMAGE_SIZE[0] - image.width) // 2
                y = (IMAGE_SIZE[1] - image.height) // 2

                canvas.paste(image, (x, y))

                # Mempertahankan struktur subfolder
                relative_path = image_path.relative_to(class_dir)

                output_path = output_class_dir / relative_path.with_suffix(".png")

                output_path.parent.mkdir(parents=True, exist_ok=True)

                # Menyimpan hasil preprocessing
                canvas.save(output_path, format="PNG")

            total_success += 1

            records.append(
                {
                    "original_filepath": image_path.relative_to(
                        PROJECT_ROOT
                    ).as_posix(),
                    "processed_filepath": output_path.relative_to(
                        PROJECT_ROOT
                    ).as_posix(),
                    "label": class_name,
                    "original_width": original_size[0],
                    "original_height": original_size[1],
                    "processed_width": IMAGE_SIZE[0],
                    "processed_height": IMAGE_SIZE[1],
                    "status": "SUCCESS",
                }
            )

        except Exception as error:

            total_failed += 1

            print(f"[GAGAL] {image_path.name}: {error}")

            records.append(
                {
                    "original_filepath": image_path.relative_to(
                        PROJECT_ROOT
                    ).as_posix(),
                    "processed_filepath": "",
                    "label": class_name,
                    "original_width": 0,
                    "original_height": 0,
                    "processed_width": 0,
                    "processed_height": 0,
                    "status": f"FAILED: {error}",
                }
            )

    print(f"Jumlah gambar ditemukan: {len(image_files)}")

# ==========================================
# 4. MENYIMPAN LAPORAN
# ==========================================

fields = [
    "original_filepath",
    "processed_filepath",
    "label",
    "original_width",
    "original_height",
    "processed_width",
    "processed_height",
    "status",
]

with open(REPORT_FILE, "w", newline="", encoding="utf-8-sig") as file:

    writer = csv.DictWriter(file, fieldnames=fields)

    writer.writeheader()
    writer.writerows(records)

# ==========================================
# 5. HASIL AKHIR
# ==========================================

print("\n================================")
print("PREPROCESSING SELESAI")
print("================================")

print(f"Gambar berhasil : {total_success}")
print(f"Gambar gagal    : {total_failed}")
print(f"Total diproses  : {len(records)}")

print(f"\nUkuran gambar   : {IMAGE_SIZE[0]} x {IMAGE_SIZE[1]}")

print(f"\nFolder output:")
print(OUTPUT_DIR)

print(f"\nLaporan:")
print(REPORT_FILE)
