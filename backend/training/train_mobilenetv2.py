import csv
import copy
import json
import random
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.optim import Adam
from torch.utils.data import DataLoader
from torchvision import datasets, transforms, models
from torchvision.models import MobileNet_V2_Weights
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix

# ==========================================
# 1. KONFIGURASI
# ==========================================

SEED = 42
BATCH_SIZE = 8
EPOCHS = 10
LEARNING_RATE = 0.001
PATIENCE = 3
IMAGE_SIZE = 224

CLASSES = ["Foto", "Ilustrasi", "Poster"]

PROJECT_ROOT = Path(__file__).resolve().parents[2]

DATA_DIR = PROJECT_ROOT / "backend" / "ai" / "dataset" / "splits" / "mobilenetv2"

OUTPUT_DIR = PROJECT_ROOT / "backend" / "ai" / "models" / "mobilenetv2"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

MODEL_PATH = OUTPUT_DIR / "best_model.pth"
HISTORY_PATH = OUTPUT_DIR / "training_history.csv"
METRICS_PATH = OUTPUT_DIR / "test_metrics.json"
CONFUSION_PATH = OUTPUT_DIR / "confusion_matrix.csv"


# ==========================================
# 2. REPRODUCIBILITY
# ==========================================

random.seed(SEED)
np.random.seed(SEED)
torch.manual_seed(SEED)

DEVICE = torch.device("cpu")

print("====================================")
print("TRAINING MOBILENETV2")
print("====================================")
print("Device:", DEVICE)
print("Dataset:", DATA_DIR)
print("Output:", OUTPUT_DIR)


# ==========================================
# 3. TRANSFORMASI GAMBAR
# ==========================================

weights = MobileNet_V2_Weights.DEFAULT

mean = weights.transforms().mean
std = weights.transforms().std

train_transform = transforms.Compose(
    [
        transforms.Resize((IMAGE_SIZE, IMAGE_SIZE)),
        transforms.RandomRotation(5),
        transforms.ColorJitter(brightness=0.15, contrast=0.15, saturation=0.10),
        transforms.ToTensor(),
        transforms.Normalize(mean=mean, std=std),
    ]
)

eval_transform = transforms.Compose(
    [
        transforms.Resize((IMAGE_SIZE, IMAGE_SIZE)),
        transforms.ToTensor(),
        transforms.Normalize(mean=mean, std=std),
    ]
)


# ==========================================
# 4. MEMUAT DATASET
# ==========================================

train_dataset = datasets.ImageFolder(DATA_DIR / "train", transform=train_transform)

val_dataset = datasets.ImageFolder(DATA_DIR / "validation", transform=eval_transform)

test_dataset = datasets.ImageFolder(DATA_DIR / "test", transform=eval_transform)

class_names = train_dataset.classes

if class_names != CLASSES:
    raise ValueError(f"Urutan kelas tidak sesuai. " f"Ditemukan: {class_names}")

if val_dataset.classes != class_names:
    raise ValueError("Kelas validation tidak cocok.")

if test_dataset.classes != class_names:
    raise ValueError("Kelas test tidak cocok.")

print("\nJumlah dataset:")
print("Train      :", len(train_dataset))
print("Validation :", len(val_dataset))
print("Test       :", len(test_dataset))
print("Kelas      :", class_names)

train_loader = DataLoader(
    train_dataset, batch_size=BATCH_SIZE, shuffle=True, num_workers=0
)

val_loader = DataLoader(
    val_dataset, batch_size=BATCH_SIZE, shuffle=False, num_workers=0
)

test_loader = DataLoader(
    test_dataset, batch_size=BATCH_SIZE, shuffle=False, num_workers=0
)


# ==========================================
# 5. MEMBANGUN MODEL MOBILENETV2
# ==========================================

print("\nMemuat MobileNetV2 pretrained...")

model = models.mobilenet_v2(weights=weights)

# Membekukan seluruh feature extractor
for parameter in model.features.parameters():
    parameter.requires_grad = False

# Mengganti classifier menjadi 3 kelas
in_features = model.classifier[1].in_features

model.classifier[1] = nn.Linear(in_features, len(class_names))

model = model.to(DEVICE)

criterion = nn.CrossEntropyLoss()

optimizer = Adam(model.classifier.parameters(), lr=LEARNING_RATE)


# ==========================================
# 6. FUNGSI EVALUASI VALIDATION
# ==========================================


def evaluate_loss(model, loader):
    model.eval()

    total_loss = 0.0
    total_correct = 0
    total_images = 0

    with torch.no_grad():
        for images, labels in loader:
            images = images.to(DEVICE)
            labels = labels.to(DEVICE)

            outputs = model(images)
            loss = criterion(outputs, labels)

            total_loss += loss.item() * images.size(0)

            predictions = torch.argmax(outputs, dim=1)

            total_correct += (predictions == labels).sum().item()

            total_images += labels.size(0)

    average_loss = total_loss / total_images
    accuracy = total_correct / total_images

    return average_loss, accuracy


# ==========================================
# 7. PROSES TRAINING
# ==========================================

best_accuracy = -1.0
best_val_loss = float("inf")
best_state = None
patience_counter = 0

history = []

for epoch in range(EPOCHS):

    model.train()
    model.features.eval()

    running_loss = 0.0
    correct = 0
    total = 0

    for images, labels in train_loader:

        images = images.to(DEVICE)
        labels = labels.to(DEVICE)

        optimizer.zero_grad()

        outputs = model(images)
        loss = criterion(outputs, labels)

        loss.backward()
        optimizer.step()

        running_loss += loss.item() * images.size(0)

        predictions = torch.argmax(outputs, dim=1)

        correct += (predictions == labels).sum().item()

        total += labels.size(0)

    train_loss = running_loss / total
    train_accuracy = correct / total

    val_loss, val_accuracy = evaluate_loss(model, val_loader)

    history.append(
        {
            "epoch": epoch + 1,
            "train_loss": train_loss,
            "train_accuracy": train_accuracy,
            "val_loss": val_loss,
            "val_accuracy": val_accuracy,
        }
    )

    print(f"\nEpoch {epoch + 1}/{EPOCHS}")
    print(f"Train Loss     : {train_loss:.4f}")
    print(f"Train Accuracy : {train_accuracy:.4f}")
    print(f"Val Loss       : {val_loss:.4f}")
    print(f"Val Accuracy   : {val_accuracy:.4f}")

    # Menyimpan model terbaik
    if val_accuracy > best_accuracy or (
        val_accuracy == best_accuracy and val_loss < best_val_loss
    ):
        best_accuracy = val_accuracy
        best_val_loss = val_loss
        best_state = copy.deepcopy(model.state_dict())

        patience_counter = 0

        torch.save(
            {
                "model_state_dict": best_state,
                "class_names": class_names,
                "image_size": IMAGE_SIZE,
                "seed": SEED,
                "architecture": "MobileNetV2",
            },
            MODEL_PATH,
        )

        print("Model terbaik berhasil disimpan.")

    else:
        patience_counter += 1
        print("Validation belum membaik.")

    if patience_counter >= PATIENCE:
        print("\nEarly stopping aktif.")
        break


# ==========================================
# 8. MENYIMPAN RIWAYAT TRAINING
# ==========================================

with open(HISTORY_PATH, "w", newline="", encoding="utf-8") as file:

    writer = csv.DictWriter(
        file,
        fieldnames=[
            "epoch",
            "train_loss",
            "train_accuracy",
            "val_loss",
            "val_accuracy",
        ],
    )

    writer.writeheader()
    writer.writerows(history)


# ==========================================
# 9. EVALUASI DATA TEST
# ==========================================

print("\n====================================")
print("EVALUASI DATA TEST")
print("====================================")

checkpoint = torch.load(MODEL_PATH, map_location=DEVICE, weights_only=True)

model.load_state_dict(checkpoint["model_state_dict"])

model.eval()

all_labels = []
all_predictions = []

with torch.no_grad():

    for images, labels in test_loader:

        images = images.to(DEVICE)

        outputs = model(images)

        predictions = torch.argmax(outputs, dim=1)

        all_labels.extend(labels.numpy())
        all_predictions.extend(predictions.cpu().numpy())


# ==========================================
# 10. METRIK EVALUASI
# ==========================================

accuracy = accuracy_score(all_labels, all_predictions)

report = classification_report(
    all_labels,
    all_predictions,
    target_names=class_names,
    output_dict=True,
    zero_division=0,
)

matrix = confusion_matrix(all_labels, all_predictions)

print(f"\nTest Accuracy: {accuracy:.4f}")

print("\nClassification Report:")

print(
    classification_report(
        all_labels, all_predictions, target_names=class_names, zero_division=0
    )
)

print("Confusion Matrix:")
print(matrix)


# ==========================================
# 11. MENYIMPAN HASIL EVALUASI
# ==========================================

metrics = {
    "architecture": "MobileNetV2",
    "classes": class_names,
    "test_accuracy": accuracy,
    "classification_report": report,
    "confusion_matrix": matrix.tolist(),
    "test_samples": len(test_dataset),
    "best_validation_accuracy": best_accuracy,
}

with open(METRICS_PATH, "w", encoding="utf-8") as file:

    json.dump(metrics, file, indent=4)

with open(CONFUSION_PATH, "w", newline="", encoding="utf-8") as file:

    writer = csv.writer(file)

    writer.writerow(["Actual / Predicted"] + class_names)

    for class_name, row in zip(class_names, matrix):
        writer.writerow([class_name] + row.tolist())


# ==========================================
# SELESAI
# ==========================================

print("\n====================================")
print("TRAINING SELESAI")
print("====================================")

print("Best model :", MODEL_PATH)
print("History    :", HISTORY_PATH)
print("Metrics    :", METRICS_PATH)
print("Confusion  :", CONFUSION_PATH)
