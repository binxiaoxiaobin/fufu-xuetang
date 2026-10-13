"""Shared narration settings for batch generation and on-demand speech."""
VOICE_VERSION = 'consistent-20261009'
CHINESE = {'voice': 'zh-CN-XiaoxiaoNeural', 'rate': '-10%', 'pitch': '-4Hz'}
ENGLISH = {'voice': 'en-US-JennyNeural', 'rate': '-12%', 'pitch': '+0Hz'}
PROFILES = {name: dict(CHINESE) for name in ('xiaoyi', 'curious', 'child')}
PROFILES['en'] = dict(ENGLISH)
