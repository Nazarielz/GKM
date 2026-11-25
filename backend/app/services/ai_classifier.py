import torch
import torch.nn as nn

from pathlib import Path
from PIL import Image, UnidentifiedImageError
from torchvision import models, transforms

# ==========================================
# 1. KONFIGURASI MODEL
# ==========================================

BASE_DIR = Path(__file__).resolve().parents[2]
PROJECT_ROOT = BASE_DIR.parent

MODEL_PATH = (
    PROJECT_ROOT / "backend" / "ai" / "models" / "mobilenetv2" / "best_model.pth"
)

DEVICE = torch.device("cpu")

IMAGE_SIZE = 224

CLASS_NAMES = ["Foto", "Ilustrasi", "Poster"]

# Normalisasi sesuai preprocessing MobileNetV2 pretrained
IMAGE_TRANSFORM = transforms.Compose(
    [
        transforms.Resize((IMAGE_SIZE, IMAGE_SIZE)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ]
)


# ==========================================
# 2. MEMUAT MODEL
# ==========================================

_model = None


def load_model():

    global _model

    if _model is not None:
        return _model

    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"File model tidak ditemukan: {MODEL_PATH}")

    checkpoint = torch.load(MODEL_PATH, map_location=DEVICE, weights_only=True)

    saved_classes = checkpoint.get("class_names")

    if saved_classes != CLASS_NAMES:
        raise ValueError(f"Urutan kelas model tidak sesuai: {saved_classes}")

    model = models.mobilenet_v2(weights=None)

    in_features = model.classifier[1].in_features

    model.classifier[1] = nn.Linear(in_features, len(CLASS_NAMES))

    model.load_state_dict(checkpoint["model_state_dict"])

    model.to(DEVICE)
    model.eval()

    _model = model

    return _model


# ==========================================
# 3. PREDIKSI GAMBAR
# ==========================================


def predict_image(image_data: bytes):

    try:
        import io

        image = Image.open(io.BytesIO(image_data))

        image.verify()

        image = Image.open(io.BytesIO(image_data)).convert("RGB")

    except (UnidentifiedImageError, OSError, ValueError):
        raise ValueError("File bukan gambar yang valid atau gambar rusak.")

    model = load_model()

    image_tensor = IMAGE_TRANSFORM(image)
    image_tensor = image_tensor.unsqueeze(0).to(DEVICE)

    with torch.no_grad():

        outputs = model(image_tensor)

        probabilities = torch.softmax(outputs, dim=1)[0]

        predicted_index = torch.argmax(probabilities).item()

    predicted_category = CLASS_NAMES[predicted_index]

    confidence = probabilities[predicted_index].item()

    probability_results = {
        CLASS_NAMES[index]: round(probabilities[index].item() * 100, 2)
        for index in range(len(CLASS_NAMES))
    }

    return {
        "predicted_category": predicted_category,
        "confidence": round(confidence * 100, 2),
        "probabilities": probability_results,
    }
