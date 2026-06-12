# Music2Emo — исправление двух ошибок инференса

## Проблема 1: `Kernel size can't be greater than actual input size`

### Симптом
```
attempt 1/3 failed: Calculated padded input size per channel: (2). Kernel size: (3).
Kernel size can't be greater than actual input size — retrying...
```

### Причина
`split_audio()` нарезает аудио на 30-секундные сегменты без проверки длины последнего фрагмента. Если трек длиннее кратного 30 секундам хотя бы на несколько сэмплов (например, 30 сек + 17 сэмплов), последний сегмент оказывается длиной в единицы сэмплов.

MERT внутри использует wav2vec2 CNN feature extractor с семью свёрточными слоями без паддинга (kernel sizes `[10, 3, 3, 3, 3, 2, 2]`, strides `[5, 2, 2, 2, 2, 2, 2]`). При 15–19 сэмплах первый слой (k=10, s=5) даёт 2 выходных фрейма, а второй слой (k=3) требует минимум 3 → краш.

### Изменение — `ml/inference/music2emo.py`, функция `split_audio`

**До:**
```python
for start in range(0, total_samples, segment_samples):
    end = min(start + segment_samples, total_samples)
    segment = waveform[start:end]
    segments.append(segment)
```

**После:**
```python
min_segment_samples = 4800  # 200 мс при 24 кГц

for start in range(0, total_samples, segment_samples):
    end = min(start + segment_samples, total_samples)
    segment = waveform[start:end]
    if segment.size(0) >= min_segment_samples:
        segments.append(segment)
```

Порог 4800 сэмплов (200 мс при 24 кГц) выбран с запасом над минимально безопасным значением 720 сэмплов (необходимо для получения ≥2 трансформерных токенов; объяснение ниже).

---

## Проблема 2: `too many indices for tensor of dimension 2`

### Симптом
```
attempt 1/3 failed: too many indices for tensor of dimension 2 — retrying...
```

### Причина
В `FeatureExtractorMERT.extract_features_from_segment` (файл `ml/inference/utils/mert.py`) использовался вызов `.squeeze()` без аргументов:

```python
torch.stack(model_outputs.hidden_states).squeeze()[1:, :, :]
```

`torch.stack(...)` формирует тензор формы `(num_layers+1, batch=1, seq_len, 768)`. Вызов `.squeeze()` **без аргумента** убирает все единичные размерности. Если `seq_len=1` (аудио дало всего один трансформерный токен), убираются и `batch`, и `seq_len` одновременно, и тензор становится 2D: `(num_layers+1, 768)`. Последующая индексация `[1:, :, :]` рассчитана на 3D → ошибка.

`seq_len=1` возникает при ~400 сэмплах входного аудио: 400 сэмплов проходят через все 7 CNN-слоёв MERT и дают ровно 1 CNN-токен.

### Изменение — `ml/inference/utils/mert.py`

**До:**
```python
all_layer_hidden_states = torch.stack(model_outputs.hidden_states).squeeze()[1:, :, :].unsqueeze(0)
```

**После:**
```python
all_layer_hidden_states = torch.stack(model_outputs.hidden_states).squeeze(1)[1:, :, :].unsqueeze(0)
```

`.squeeze(1)` убирает только размерность `batch` (индекс 1), не трогая `seq_len`. Тензор всегда остаётся 3D вне зависимости от длины входного аудио.

---

## Связь между двумя проблемами

Обе ошибки триггерятся одним и тем же источником — слишком коротким хвостовым сегментом. Если порог в `split_audio` поднять, проблема 2 тоже становится практически недостижимой. Тем не менее, `.squeeze(1)` исправлен как самостоятельный баг, чтобы защититься от edge-cases в будущем (например, при нестандартном размере батча).

| # | Файл | Строка | Было | Стало |
|---|---|---|---|---|
| 1 | `ml/inference/music2emo.py` | `split_audio()` | нет проверки длины сегмента | `if segment.size(0) >= 4800` |
| 2 | `ml/inference/utils/mert.py` | `extract_features_from_segment()` | `.squeeze()` | `.squeeze(1)` |

---

## Влияние на точность предсказания

**Незначительное, практически нулевое.**

- Отбрасываемые сегменты — хвостовые фрагменты длиной < 200 мс (4800 сэмплов при 24 кГц). Такой фрагмент образуется только когда трек длиннее кратного 30 секундам на менее чем 0.2 секунды.
- Финальный эмбеддинг MERT вычисляется как среднее по всем сегментам. Выброс 200 мс из 30–300 секунд аудио составляет менее 1% данных.
- Альтернатива — не делать предсказание вообще (файл помечался как ошибка `-1/-1/Undefined` и пропускался), что хуже любого незначительного смещения.
