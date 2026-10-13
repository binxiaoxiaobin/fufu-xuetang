"""Apply the small integration changes to the existing compact application source."""
from pathlib import Path
root=Path(__file__).resolve().parent.parent/'frontend'
p=root/'app.js';s=p.read_text(encoding='utf-8')
if "curriculumScope=null" not in s:
    s=s.replace("mode='challenge') {", "mode='challenge',curriculumScope=null) {")
    s=s.replace("knowledge_point:knowledgePoint})", "knowledge_point:knowledgePoint,...(curriculumScope||{})})")
    s=s.replace("state.quizKnowledgePoint=knowledgePoint;", "state.quizKnowledgePoint=knowledgePoint;state.quizCurriculum=curriculumScope;")
    s=s.replace("${q.subject} · ${state.profile?.grade||'学习闯关'}", "${q.subject} · ${state.profile?.grade||'学习闯关'}${state.quizCurriculum?.label?' · '+state.quizCurriculum.label:''}")
    s=s.replace("const focus=state.quizKnowledgePoint?` · ${escapeHtml(state.quizKnowledgePoint)}`:'';", "const focus=(state.quizCurriculum?.label||state.quizKnowledgePoint)?` · ${escapeHtml(state.quizCurriculum?.label||state.quizKnowledgePoint)}`:'';")
    s=s.replace("state.quizKnowledgePoint,state.quizMode);", "state.quizKnowledgePoint,state.quizMode,state.quizCurriculum);")
    s=s.replace("navigate('home'));}else renderQuestion();", "navigate(state.quizCurriculum?'curriculum':'home'));}else renderQuestion();")
    s=s.replace("FufuTTS.cancel();navigate('home');", "FufuTTS.cancel();navigate(state.quizCurriculum?'curriculum':'home');")
    s=s.replace("${nextLabel}</button><button class=\"secondary-btn\" id=\"finishQuiz\">回到学习首页", "${nextLabel}</button><button class=\"secondary-btn\" id=\"finishQuiz\">${state.quizCurriculum?'返回教材目录':'回到学习首页'}")
    s=s.replace("api('/questions')", "api('/questions?scope=learner')")
    p.write_text(s,encoding='utf-8')
p=root/'index.html';s=p.read_text(encoding='utf-8')
if '/curriculum.css' not in s:
    s=s.replace('</head>','<link rel="stylesheet" href="/curriculum.css?v=20261003-grade1-1"></head>')
    s=s.replace('<script src="/extras.js', '<script src="/curriculum.js?v=20261003-grade1-1"></script><script src="/extras.js',1)
s=s.replace('/app.js?v=20261003-performance-1','/app.js?v=20261003-grade1-1')
p.write_text(s,encoding='utf-8')
