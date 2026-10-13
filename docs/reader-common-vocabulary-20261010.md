# 常用词汇游乐场（2026-10-10）

字母放置读音：英文字母正确落位后播放字母名称，最后一个字母读完再播放当前词语的本地录音。26个大写字母名称在现有共享tts清单中补齐，统一英语Jenny配置。连续操作切换声音，页面退出或进入下一阶段取消未完成的整词连读。不是音素教学。scripts/test_reader_letter_speech.cjs 验证最后字母到整词的顺序、页面退出、阶段切换和被打断时没有延迟续播；26个MP3已逐一验证可解码。

本次将识字快练、单词快练从词卡目录改为一次一个词的游乐场。入口只显示主题、难度和一个推荐词，可以主动换词；窄屏使用主题下拉选择。仍不限制年级。共 308 组原创练习，识字和英语各 154 组，11 个主题，3 档难度。没有把全部单词铺在页面上。

第二次改造移除入口主插图及运行中的小剧场，停止加载 reader-vignettes.js。流程改为字块散开后拼回 → 句子外三个候选词中找出本轮的词 → 听录音辨词 → 完成与整句朗读。拼字混入最多两个非目标字块，优先形近汉字或相似英文字符。句子候选词优先人工整理的近似词，其余使用同主题常用词；句子提示明确“选出刚刚认识的词”，避免把语法也成立的其他候选词武断判错。听音轮不显示目标词标题。每轮顺序随机，错误可重试，无计时扣分；完成三步只发一次 1 分。字块爆散动画约 0.85 秒，支持减少动态效果；不把字母名称误称为自然拼读。

对比词表在 content/questions/original/reader-confusions.json，由构建脚本写入每条题目 choice_words / extra_characters，再经 reader-common-20261010-v8 迁移入数据库。验证308条都有两个不同的候选干扰词，目标词不在干扰项中，额外字块不重复且不属于目标词。当前仍为练习时的提示反馈，不把前端三步计数当作完整学习诊断。后续适合加入易错字笔画对照、听音换一字、词义分类和间隔复习；自然拼读需要另建经核对的音素、词族和对应录音库。

新增 82 对常用中文/英文词句，来源 content/questions/original/reader-common-expansion.txt。原有词汇题号保持不变，新增题号从现有最大值继续分配。题目、释义、分类、难度、小剧场类型、音频及配图关联都存入 MySQL questions.source_metadata；素材登记 media_assets。首页只读汇总，进入对应语言才读词库，不预载所有录音和配图。

素材：616 条本地录音在 frontend/assets/audio/reader-lessons，统一中文 Xiaoxiao 和英语 Jenny；旧308张 SVG 仍保留其数据库关联，练习和推荐词不再显示。主题图标仍沿用现有轻量 SVG。仅字块和答案反馈运行动画，不引入三维渲染器或视频播放器，支持减少动态效果。

更新流程：build_reader_lessons.py → build_reader_art.cjs → generate_reader_audio.py → publish_reader_lessons.py。内容构建保留未变文字的录音及稳定题号；艺术生成保留 SVG 命名空间；发布前必须验证素材存在，并更新 reader_lessons.VERSION 后事务发布。数据已通过题号唯一性、616 个 MP3 解码、308 张独立 SVG 结构/命名空间、媒体关联验证。

scripts/test_reader_lessons.py 使用真实数据库检查无年级限制、两个语言、图片和录音关联、奖励及重复提交保护，测试事务回滚。普通做题数据库测试和退出页面停止语音测试均通过。浏览器验证了错误提示、重复字母、拼词、句子空位、朗读入口、积分、主题/难度选择、空主题提示及新图片实际加载。实际 iPad 拖动还需真机验收；点选可完成整个学习流程。

参考：Originator 官方 Endless Reader 介绍（https://support.originatorkids.com/endless-reader-2/）、Reading Rockets Phonics: In Practice（https://www.readingrockets.org/reading-101/reading-101-learning-modules/course-modules/phonics/practice）、EEF Developing vocabulary（https://educationendowmentfoundation.org.uk/early-years/literacy/developing-vocabulary-in-early-years-education）。拼词、情境句和声音识别的组合是结合这些教学资料与本项目反馈作出的设计判断，不是对本项目学习效果的实验验证。项目未使用原作角色、原作美术或原作题库。最终候选词发布版本 reader-common-20261010-v9，优先人工近似词，其余按同主题、难度和拼写相似度排序。
