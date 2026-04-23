import warnings
warnings.filterwarnings("ignore")

import re, json, os, time
from datetime import datetime
from collections import deque

import pandas as pd
import numpy as np
import joblib
from flask import Flask, render_template, request, jsonify

from sklearn.metrics import accuracy_score, f1_score, confusion_matrix, classification_report
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.svm import LinearSVC
from sklearn.naive_bayes import ComplementNB
from sklearn.ensemble import RandomForestClassifier
from sklearn.pipeline import Pipeline
from sklearn.utils.class_weight import compute_class_weight

app = Flask(__name__)

# ── Constants ──────────────────────────────────────────────
BASE_DIR   = os.path.dirname(__file__)
MODEL_PATH = os.path.join(BASE_DIR, "best_model.pkl")
DATA_PATH  = os.path.join(BASE_DIR, "labeled_data.csv")
CLASS_NAMES = {0: "Hate Speech", 1: "Offensive", 2: "Neither"}
CLASS_COLORS = {0: "#E24B4A", 1: "#EF9F27", 2: "#1D9E75"}
MAX_HISTORY = 20

STOPWORDS = set([
    "i","me","my","myself","we","our","ours","ourselves","you","your","yours",
    "he","him","his","she","her","hers","it","its","they","them","their","what",
    "which","who","whom","this","that","these","those","am","is","are","was",
    "were","be","been","being","have","has","had","do","does","did","will",
    "would","shall","should","may","might","must","can","could","a","an","the",
    "and","but","if","or","because","as","until","while","of","at","by","for",
    "with","about","against","between","into","through","during","before",
    "after","to","from","in","out","on","off","then","so","than","too","very",
    "just","up","down","not","no",
])

# ── In-memory state ────────────────────────────────────────
history = deque(maxlen=MAX_HISTORY)
session_stats = {"total": 0, "hate": 0, "offensive": 0, "neither": 0}

# ── Model loading ──────────────────────────────────────────
model = None

def load_model():
    global model
    model = joblib.load(MODEL_PATH)
    print(f"[OK] Model loaded from {MODEL_PATH}")

def preprocess(text: str) -> str:
    text = str(text).lower()
    text = re.sub(r"http\S+|www\S+", "", text)
    text = re.sub(r"@\w+", "", text)
    text = re.sub(r"#(\w+)", r"\1", text)
    text = re.sub(r"rt\s+", "", text)
    text = re.sub(r"[^\w\s]", " ", text)
    text = re.sub(r"\d+", "", text)
    tokens = [t for t in text.split() if t not in STOPWORDS and len(t) > 1]
    return " ".join(tokens)

def predict_text(text: str) -> dict:
    clean = preprocess(text)
    label = int(model.predict([clean])[0])
    clf = model.named_steps["clf"]
    if hasattr(clf, "predict_proba"):
        proba = model.predict_proba([clean])[0].tolist()
        confidence = proba[label]
    else:
        proba = [0.0, 0.0, 0.0]
        confidence = 0.9
        proba[label] = confidence
    word_count = len(text.split())
    caps_ratio = round(sum(1 for c in text if c.isupper()) / max(len(text), 1), 3)
    return {
        "text": text,
        "clean_text": clean,
        "label": label,
        "label_name": CLASS_NAMES[label],
        "color": CLASS_COLORS[label],
        "confidence": round(confidence * 100, 1),
        "probabilities": {CLASS_NAMES[i]: round(p * 100, 1) for i, p in enumerate(proba)},
        "word_count": word_count,
        "caps_ratio": round(caps_ratio * 100, 1),
        "timestamp": datetime.now().strftime("%H:%M:%S"),
    }

# ── Dataset stats (cached) ────────────────────────────────
_dataset_stats = None

def get_dataset_stats():
    global _dataset_stats
    if _dataset_stats is not None:
        return _dataset_stats
    df = pd.read_csv(DATA_PATH, index_col=0)
    total = len(df)
    counts = df["class"].value_counts().to_dict()
    _dataset_stats = {
        "total": total,
        "hate_count":      counts.get(0, 0),
        "offensive_count": counts.get(1, 0),
        "neither_count":   counts.get(2, 0),
        "hate_pct":        round(counts.get(0, 0) / total * 100, 1),
        "offensive_pct":   round(counts.get(1, 0) / total * 100, 1),
        "neither_pct":     round(counts.get(2, 0) / total * 100, 1),
        "avg_len":         round(df["tweet"].apply(len).mean(), 1),
        "avg_words":       round(df["tweet"].apply(lambda x: len(x.split())).mean(), 1),
    }
    return _dataset_stats

# ── Model performance (cached) ────────────────────────────
_model_perf = None

def get_model_performance():
    global _model_perf
    if _model_perf is not None:
        return _model_perf
    df = pd.read_csv(DATA_PATH, index_col=0)
    df["clean"] = df["tweet"].apply(preprocess)
    X, y = df["clean"], df["class"]
    _, X_test, _, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    y_pred = model.predict(X_test)
    cm = confusion_matrix(y_test, y_pred).tolist()
    report = classification_report(y_test, y_pred,
                                   target_names=list(CLASS_NAMES.values()),
                                   output_dict=True)
    _model_perf = {
        "accuracy":    round(accuracy_score(y_test, y_pred) * 100, 2),
        "f1_macro":    round(f1_score(y_test, y_pred, average="macro") * 100, 2),
        "f1_weighted": round(f1_score(y_test, y_pred, average="weighted") * 100, 2),
        "confusion_matrix": cm,
        "report": {k: {m: round(v * 100, 1) if isinstance(v, float) else v
                       for m, v in val.items()}
                   for k, val in report.items() if isinstance(val, dict)},
    }
    return _model_perf

# ── Routes ─────────────────────────────────────────────────
@app.route("/", methods=["GET", "POST"])
def index():
    ds = get_dataset_stats()
    return render_template("index.html", ds=ds)

@app.route("/predict", methods=["POST"])
def predict():
    data = request.get_json()
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"error": "Empty input"}), 400
    result = predict_text(text)
    history.appendleft(result)
    session_stats["total"] += 1
    key = {0: "hate", 1: "offensive", 2: "neither"}[result["label"]]
    session_stats[key] += 1
    return jsonify(result)

@app.route("/history")
def get_history():
    return jsonify(list(history))

@app.route("/stats")
def stats():
    return jsonify(session_stats) 

@app.route("/performance")
def performance():
    perf = get_model_performance()
    return jsonify(perf)

@app.route("/dataset")
def dataset():
    df = pd.read_csv(DATA_PATH, index_col=0)
    sample = df.sample(50, random_state=42)[["tweet", "class"]].copy()
    sample["label"] = sample["class"].map(CLASS_NAMES)
    sample["color"] = sample["class"].map(CLASS_COLORS)
    return jsonify(sample.to_dict(orient="records"))

if __name__ == "__main__":
    load_model()
    app.run(debug=True, port=5001)