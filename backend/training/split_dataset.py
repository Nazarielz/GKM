from pathlib import Path
import csv
import random
import shutil

# ==========================================
# 1. KONFIGURASI
# ==========================================

PROJECT_ROOT = Path(__file__).resolve().parents[2]

DATASET_DIR = PROJECT_ROOT / "backend" / "ai" / "dataset"

SOURCE_DIR = DATASET_DIR / "processed" / "mobilenetv2"

OUTPUT_DIR = DATASET_DIR / "splits" / "mobilenetv2"

MANIFEST_FILE = DATASET_DIR / "split_manifest.csv"

CLASSES = ["Ilustrasi", "Foto", "Poster"]

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}

RANDOM_SEED = 42

# Jumlah per kategori
TRAIN_COUNT = 24
VAL_COUNT = 6
TEST_COUNT = 10

EXPECTED_COUNT = TRAIN_COUNT + VAL_COUNT + TEST_COUNT

# ==========================================
# 2. VALIDASI FOLDER
# ==========================================

if not SOURCE_DIR.exists():
    raise FileNotFoundError(f"Folder preprocessing tidak ditemukan: {SOURCE_DIR}")

if OUTPUT_DIR.exists():
    raise FileExistsError(
        f"Folder output sudah ada: {OUTPUT_DIR}\n"
        "Periksa hasil sebelumnya atau gunakan nama folder baru."
    )

# ==========================================
# 3. PERSIAPAN
# ==========================================

random_generator = random.Random(RANDOM_SEED)

splits = {"train": [], "validation": [], "test": []}

records = []

# ==========================================
# 4. PEMBAGIAN DATASET
# ==========================================

for class_name in CLASSES:

    class_dir = SOURCE_DIR / class_name

    if not class_dir.exists():
        raise FileNotFoundError(f"Kategori tidak ditemukan: {class_name}")

    image_files = sorted(
        path
        for path in class_dir.rglob("*")
        if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
    )

    print(f"\nKategori: {class_name}")
    print(f"Jumlah gambar: {len(image_files)}")

    if len(image_files) != EXPECTED_COUNT:
        raise ValueError(
            f"{class_name} harus memiliki {EXPECTED_COUNT} gambar, "
            f"tetapi ditemukan {len(image_files)}."
        )

    # Pengacakan dengan seed tetap
    random_generator.shuffle(image_files)

    # Pembagian gambar
    test_images = image_files[:TEST_COUNT]

    val_images = image_files[TEST_COUNT : TEST_COUNT + VAL_COUNT]

    train_images = image_files[TEST_COUNT + VAL_COUNT :]

    class_splits = {
        "train": train_images,
        "validation": val_images,
        "test": test_images,
    }

    for split_name, files in class_splits.items():

        for image_path in files:

            relative_path = image_path.relative_to(class_dir)

            destination = OUTPUT_DIR / split_name / class_name / relative_path

            destination.parent.mkdir(parents=True, exist_ok=True)

            # Menyalin gambar, bukan memindahkan
            shutil.copy2(image_path, destination)

            splits[split_name].append(destination)

            records.append(
                {
                    "filepath": destination.relative_to(PROJECT_ROOT).as_posix(),
                    "label": class_name,
                    "split": split_name,
                    "original_filepath": image_path.relative_to(
                        PROJECT_ROOT
                    ).as_posix(),
                }
            )

        print(f"{split_name}: {len(files)} gambar")

# ==========================================
# 5. SIMPAN MANIFEST
# ==========================================

fields = ["filepath", "label", "split", "original_filepath"]

with open(MANIFEST_FILE, "w", newline="", encoding="utf-8-sig") as file:

    writer = csv.DictWriter(file, fieldnames=fields)

    writer.writeheader()
    writer.writerows(records)

# ==========================================
# 6. RINGKASAN
# ==========================================

print("\n================================")
print("PEMBAGIAN DATASET SELESAI")
print("================================")

for split_name, files in splits.items():
    print(f"{split_name}: {len(files)} gambar")

print(f"\nTotal gambar: {len(records)}")
print(f"Random seed: {RANDOM_SEED}")
print(f"Folder output: {OUTPUT_DIR}")
print(f"Manifest: {MANIFEST_FILE}")
