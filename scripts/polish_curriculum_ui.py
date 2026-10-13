from pathlib import Path
root=Path(__file__).resolve().parent.parent/'frontend'
p=root/'curriculum.js';s=p.read_text(encoding='utf-8')
s=s.replace("subject:'数学', book:null", "subject:'数学', grade:'一年级', book:null")
s=s.replace('<label>每组题量<select id="curriculumCount">', '<label>练习年级<select id="curriculumGrade"><option>一年级</option><option>二年级</option><option>三年级</option><option>四年级</option><option>五年级</option><option>六年级</option></select></label><label>每组题量<select id="curriculumCount">')
s=s.replace('subject=${encodeURIComponent(model.subject)}`', 'subject=${encodeURIComponent(model.subject)}&grade=${encodeURIComponent(model.grade)}`')
if "$('curriculumGrade').onchange" not in s:
    s=s.replace("$('curriculumCount').onchange", "$('curriculumGrade').onchange=e=>{model.grade=e.target.value;loadBooks();};\n  $('curriculumCount').onchange")
s=s.replace("book.edition+' · 原创同步练习'", "book.edition+' · 原创同步练习 · 可复习其他年级，不改变个人学习年级'")
p.write_text(s,encoding='utf-8')
p=root/'app.js';s=p.read_text(encoding='utf-8')
s=s.replace("state.wrongAttempts=0;$('#questSubject')", "state.wrongAttempts=0;$('#questBack').textContent=state.quizCurriculum?'← 返回教材目录':'← 返回学习首页';$('#questSubject')")
s=s.replace("${state.profile?.grade||'学习闯关'}${state.quizCurriculum", "${q.grade&&q.grade!=='*'?q.grade:(state.profile?.grade||'学习闯关')}${state.quizCurriculum")
p.write_text(s,encoding='utf-8')
