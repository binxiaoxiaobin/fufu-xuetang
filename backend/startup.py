"""Shared application initialization used by both the server and setup scripts."""

import action_cards
import community
import content_catalog
import earth_culture
import english_songs
import farm
import game_access
import geography_catalog
import history_cards
import history_wisdom
import mysql_db
import picture_books
import pinyin_cards
import reader_lessons
import reading_cards
import solar_catalog
import toy_games
import transport_catalog
from mysql_learning_db import connect, initialize as initialize_learning_db


def initialize_application():
    """Create and upgrade every schema the running application depends on.

    Keep this list in one place: the offline initializer and the web server must
    prepare the same application, in the same order.
    """
    mysql_db.initialize()
    content_catalog.initialize()
    action_cards.initialize()
    english_songs.initialize()
    pinyin_cards.initialize()
    reading_cards.initialize()
    history_cards.initialize()
    history_wisdom.initialize()
    picture_books.initialize()
    geography_catalog.initialize()
    earth_culture.initialize()
    reader_lessons.initialize()
    transport_catalog.initialize()
    solar_catalog.initialize()
    initialize_learning_db()
    game_access.initialize()
    community.initialize()
    farm.initialize()
    toy_games.initialize()
    with connect() as db:
        farm.seed_products(db)
