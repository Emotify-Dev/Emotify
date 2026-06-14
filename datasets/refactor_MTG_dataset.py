import pandas as pd
import os
from sklearn.preprocessing import MultiLabelBinarizer

INPUT_FILE = 'MTG/autotagging_moodtheme.tsv'
OUTPUT_FILE = 'MTG/moodtheme_mertspecs_low_npy.csv'
BASE_PATH = '/Volumes/T7 Shield/Emotify/MTG_dataset/mertspecs/'

MOOD_THEMES = sorted([
    "love", "happy", "energetic", "dark", "relaxing", "melodic", "sad", "dream",
    "film", "emotional", "epic", "romantic", "melancholic", "space", "meditative",
    "uplifting", "ballad", "inspiring", "calm", "soft", "slow", "fun", "christmas",
    "motivational", "positive", "upbeat", "dramatic", "deep", "children", "adventure",
    "soundscape", "summer", "powerful", "hopeful", "advertising", "party", "background",
    "action", "movie", "drama", "nature", "cool", "funny", "documentary", "horror",
    "fast", "ambiental", "groovy", "corporate", "commercial", "travel", "sport",
    "mellow", "retro", "game", "sexy", "trailer", "heavy", "holiday"
])

def process_tsv_to_csv():
    data_rows = []

    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        header = next(f)

        for line in f:
            line = line.strip()
            if not line: continue

            parts = line.split('\t')

            if len(parts) < 6:
                continue

            track_id = parts[0]
            # artist = parts[1]
            # album = parts[2]
            rel_path = parts[3]
            duration = parts[4]
            raw_tags = parts[5:]

            clean_tags = []
            for t in raw_tags:
                clean_t = t.replace('mood/theme---', '').strip()
                if clean_t in MOOD_THEMES:
                    clean_tags.append(clean_t)

            data_rows.append({
                'TRACK_ID': track_id,
                'PATH': os.path.join(BASE_PATH, rel_path),
                'DURATION': duration,
                'tags_list': clean_tags
            })

    df = pd.DataFrame(data_rows)

    mlb = MultiLabelBinarizer(classes=MOOD_THEMES)
    tags_encoded = mlb.fit_transform(df['tags_list'])
    tags_df = pd.DataFrame(tags_encoded, columns=mlb.classes_)

    final_df = pd.concat([
        df[['TRACK_ID', 'PATH', 'DURATION']],
        tags_df
    ], axis=1)

    print(f"Saved to: {OUTPUT_FILE}")
    final_df.to_csv(OUTPUT_FILE, index=False)

if __name__ == "__main__":
    process_tsv_to_csv()