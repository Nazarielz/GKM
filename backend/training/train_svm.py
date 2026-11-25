import csv
import json
import time
from pathlib import Path

import numpy as np
from PIL import Image

import joblib

from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from sklearn.model_selection import GridSearchCV, StratifiedKFold
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix

from torchvision.datasets import ImageFolder

# ==========================================
# 1. KONFIGURASI
# ==========================================

SEED = 42
IMAGE_SIZE = (128, 128)
HISTOGRAM_BINS = 16

PROJECT_ROOT = Path(__file__).resolve().parents[2]

DATA_DIR = PROJECT_ROOT / "backend" / "ai" / "dataset" / "splits" / "mobilenetv2"

OUTPUT_DIR = PROJECT_ROOT / "backend" / "ai" / "models" / "svm"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

MODEL_PATH = OUTPUT_DIR / "svm_model.joblib"
METRICS_PATH = OUTPUT_DIR / "svm_metrics.json"
CONFUSION_PATH = OUTPUT_DIR / "svm_confusion_matrix.csv"


# ==========================================
# 2. EKSTRAKSI FITUR WARNA HSV
# ==========================================


def extract_color_features(image):
    image = image.convert("HSV")

    image = image.resize(IMAGE_SIZE, Image.Resampling.LANCZOS)

    image_array = np.asarray(image)

    features = []

    for channel in range(3):

        histogram, _ = np.histogram(
            image_array[:, :, channel], bins=HISTOGRAM_BINS, range=(0, 256)
        )

        histogram = histogram.astype(np.float32)

        histogram /= histogram.sum() + 1e-8

        features.extend(histogram)

    return features


# ==========================================
# 3. EKSTRAKSI FITUR TEKSTUR LBP
# ==========================================


def extract_texture_features(image):

    image = image.convert("L")

    image = image.resize(IMAGE_SIZE, Image.Resampling.LANCZOS)

    gray = np.asarray(image, dtype=np.uint8)

    lbp = np.zeros(gray.shape, dtype=np.uint8)

    # Membandingkan 8 tetangga piksel
    neighbors = [(-1, -1), (-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1)]

    for bit, (dy, dx) in enumerate(neighbors):

        shifted = np.roll(gray, shift=(dy, dx), axis=(0, 1))

        lbp |= (shifted >= gray).astype(np.uint8) << bit

    # Menghindari piksel tepi hasil roll
    lbp = lbp[1:-1, 1:-1]

    histogram, _ = np.histogram(lbp, bins=256, range=(0, 256))

    histogram = histogram.astype(np.float32)

    histogram /= histogram.sum() + 1e-8

    return histogram


# ==========================================
# 4. GABUNGKAN FITUR WARNA DAN TEKSTUR
# ==========================================


def extract_features(image_path):

    with Image.open(image_path) as image:

        image = image.convert("RGB")

        color_features = extract_color_features(image)

        texture_features = extract_texture_features(image)

    return np.concatenate([color_features, texture_features])


# ==========================================
# 5. MEMUAT DATASET DAN FITUR
# ==========================================


def load_dataset(split_name):

    dataset = ImageFolder(DATA_DIR / split_name)

    features = []
    labels = []

    print(f"\nMengekstrak fitur: {split_name}")

    for image_path, label in dataset.samples:

        feature = extract_features(image_path)

        features.append(feature)
        labels.append(label)

    return (np.asarray(features, dtype=np.float32), np.asarray(labels), dataset.classes)


print("====================================")
print("TRAINING MODEL SVM")
print("====================================")

print("Dataset:", DATA_DIR)
print("Output :", OUTPUT_DIR)

start_time = time.perf_counter()

X_train, y_train, class_names = load_dataset("train")

X_val, y_val, val_classes = load_dataset("validation")

X_test, y_test, test_classes = load_dataset("test")

if class_names != val_classes or class_names != test_classes:
    raise ValueError("Urutan kelas dataset tidak konsisten.")

print("\nJumlah dataset:")
print("Train      :", len(X_train))
print("Validation :", len(X_val))
print("Test       :", len(X_test))

print("Jumlah fitur:", X_train.shape[1])
print("Kelas:", class_names)


# ==========================================
# 6. MEMBANGUN PIPELINE SVM
# ==========================================

pipeline = Pipeline(
    [
        ("scaler", StandardScaler()),
        ("svc", SVC(class_weight="balanced", random_state=SEED)),
    ]
)

parameter_grid = [
    {"svc__kernel": ["linear"], "svc__C": [0.1, 1, 10, 100]},
    {
        "svc__kernel": ["rbf"],
        "svc__C": [0.1, 1, 10, 100],
        "svc__gamma": ["scale", "auto"],
    },
]

cross_validation = StratifiedKFold(n_splits=3, shuffle=True, random_state=SEED)

search = GridSearchCV(
    estimator=pipeline,
    param_grid=parameter_grid,
    scoring="f1_macro",
    cv=cross_validation,
    n_jobs=1,
    refit=True,
    verbose=1,
)


# ==========================================
# 7. TRAINING DAN PEMILIHAN PARAMETER
# ==========================================

print("\nMemulai pencarian parameter SVM...")

search.fit(X_train, y_train)

best_model = search.best_estimator_

print("\nParameter terbaik:")
print(search.best_params_)

print("Cross-validation Macro F1:", round(search.best_score_, 4))


# ==========================================
# 8. EVALUASI VALIDATION DAN TEST
# ==========================================

val_predictions = best_model.predict(X_val)

test_predictions = best_model.predict(X_test)

val_accuracy = accuracy_score(y_val, val_predictions)

test_accuracy = accuracy_score(y_test, test_predictions)

report = classification_report(
    y_test,
    test_predictions,
    labels=np.arange(len(class_names)),
    target_names=class_names,
    output_dict=True,
    zero_division=0,
)

matrix = confusion_matrix(y_test, test_predictions, labels=np.arange(len(class_names)))

print("\n====================================")
print("HASIL VALIDATION")
print("====================================")

print(f"Validation Accuracy: {val_accuracy:.4f}")

print("\n====================================")
print("HASIL TEST")
print("====================================")

print(f"Test Accuracy: {test_accuracy:.4f}")

print("\nClassification Report:")

print(
    classification_report(
        y_test,
        test_predictions,
        labels=np.arange(len(class_names)),
        target_names=class_names,
        zero_division=0,
    )
)

print("Confusion Matrix:")
print(matrix)


# ==========================================
# 9. SIMPAN MODEL DAN HASIL
# ==========================================

joblib.dump(best_model, MODEL_PATH)

elapsed_time = time.perf_counter() - start_time

metrics = {
    "model": "SVM",
    "features": ["HSV Color Histogram", "Local Binary Pattern"],
    "classes": class_names,
    "train_samples": len(X_train),
    "validation_samples": len(X_val),
    "test_samples": len(X_test),
    "feature_count": int(X_train.shape[1]),
    "best_parameters": search.best_params_,
    "cross_validation_macro_f1": float(search.best_score_),
    "validation_accuracy": float(val_accuracy),
    "test_accuracy": float(test_accuracy),
    "classification_report": report,
    "confusion_matrix": matrix.tolist(),
    "training_runtime_seconds": elapsed_time,
}

with open(METRICS_PATH, "w", encoding="utf-8") as file:

    json.dump(metrics, file, indent=4)

with open(CONFUSION_PATH, "w", newline="", encoding="utf-8") as file:

    writer = csv.writer(file)

    writer.writerow(["Actual / Predicted"] + class_names)

    for class_name, row in zip(class_names, matrix):
        writer.writerow([class_name] + row.tolist())


# ==========================================
# 10. SELESAI
# ==========================================

print("\n====================================")
print("TRAINING SVM SELESAI")
print("====================================")

print("Model      :", MODEL_PATH)
print("Metrics    :", METRICS_PATH)
print("Confusion  :", CONFUSION_PATH)
print(f"Runtime    : {elapsed_time:.2f} detik")
