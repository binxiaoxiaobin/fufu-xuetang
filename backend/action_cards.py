"""Schema boundary for database-backed clay action cards."""
from mysql_db import connection


def initialize():
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""CREATE TABLE IF NOT EXISTS learning_action_cards (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                slug VARCHAR(50) NOT NULL UNIQUE,
                word VARCHAR(80) NOT NULL, meaning VARCHAR(120) NOT NULL,
                sentence VARCHAR(200) NOT NULL, translation VARCHAR(200) NOT NULL,
                hint VARCHAR(300) NOT NULL, group_name VARCHAR(80) NOT NULL,
                color VARCHAR(20) NOT NULL, position SMALLINT UNSIGNED NOT NULL,
                image_asset_id BIGINT UNSIGNED NOT NULL,
                word_audio_asset_id BIGINT UNSIGNED NULL,
                sentence_audio_asset_id BIGINT UNSIGNED NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'published',
                FOREIGN KEY (image_asset_id) REFERENCES media_assets(id),
                FOREIGN KEY (word_audio_asset_id) REFERENCES media_assets(id),
                FOREIGN KEY (sentence_audio_asset_id) REFERENCES media_assets(id),
                INDEX idx_action_cards_public (status,position)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""")
        conn.commit()
    import action_cards_clay
    action_cards_clay.initialize()
    import vocabulary_cards
    vocabulary_cards.initialize()


def list_cards():
    import vocabulary_cards
    return vocabulary_cards.list_cards('actions')


def list_english_cards():
    import vocabulary_cards
    return vocabulary_cards.list_cards()
