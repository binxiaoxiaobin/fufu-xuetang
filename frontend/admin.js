const $ = selector => document.querySelector(selector);
const API = `${window.FUFU_API_BASE || ''}/api`;
const state = { stories: [], selectedId: null };

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '请求失败，请稍后重试。');
  return result;
}

function setStatus(message, kind = '') {
  const status = $('#connectionStatus');
  status.textContent = message;
  status.className = `connection-status ${kind}`;
}

function renderList() {
  const query = $('#storySearch').value.trim().toLowerCase();
  const stories = state.stories.filter(story => `${story.title} ${story.category} ${story.slug}`.toLowerCase().includes(query));
  $('#storyCount').textContent = `${stories.length} 篇`;
  $('#storyList').innerHTML = stories.length ? stories.map(story => `
    <button class="story-list-item ${story.id === state.selectedId ? 'selected' : ''}" type="button" data-id="${story.id}">
      <img src="${escapeHtml(story.cover || '/assets/bear-sun.svg')}" alt="" onerror="this.src='/assets/bear-sun.svg'">
      <span><small>${escapeHtml(story.category)} · ${escapeHtml(story.age)}</small><b>${escapeHtml(story.title)}</b><em>${escapeHtml(story.summary)}</em></span>
    </button>`).join('') : '<p class="list-empty">没有找到匹配内容</p>';
  document.querySelectorAll('[data-id]').forEach(button => button.addEventListener('click', () => selectStory(Number(button.dataset.id))));
}

function clearForm() {
  state.selectedId = null;
  $('#storyForm').reset();
  $('#storyId').value = '';
  $('#storyType').value = 'chengyu';
  $('#readingMinutes').value = 3;
  $('#coverStatus').value = 'ready';
  $('#color').value = '#e6d8ba';
  $('#editorTitle').textContent = '新建故事或科普';
  $('#deleteStory').disabled = true;
  $('#formMessage').textContent = '';
  renderList();
}

function selectStory(id) {
  const story = state.stories.find(item => item.id === id);
  if (!story) return;
  state.selectedId = id;
  $('#storyId').value = id;
  $('#title').value = story.title;
  $('#slug').value = story.slug;
  $('#storyType').value = story.story_type;
  $('#age').value = story.age;
  $('#category').value = story.category;
  $('#readingMinutes').value = story.reading_minutes;
  $('#color').value = story.color;
  $('#cover').value = story.cover;
  $('#summary').value = story.summary;
  $('#paragraphs').value = story.paragraphs.join('\n\n---\n\n');
  $('#moral').value = story.moral;
  $('#tags').value = story.tags.join('，');
  $('#coverStatus').value = story.cover_status;
  $('#sourceNote').value = story.source_note;
  $('#coverPrompt').value = story.cover_prompt;
  $('#editorTitle').textContent = story.title;
  $('#deleteStory').disabled = false;
  $('#formMessage').textContent = '';
  renderList();
}

async function refreshList(selectId = null) {
  try {
    state.stories = await request('/admin/stories');
    setStatus(`MySQL 已连接 · ${state.stories.length} 篇内容`, 'connected');
    renderList();
    if (selectId) selectStory(selectId);
    else if (!state.stories.some(story => story.id === state.selectedId)) clearForm();
  } catch (error) {
    setStatus(error.message, 'error');
    $('#storyList').innerHTML = '<p class="list-empty">无法载入内容，请检查后端与 MySQL 连接。</p>';
  }
}

$('#storySearch').addEventListener('input', renderList);
$('#createStory').addEventListener('click', clearForm);
$('#resetForm').addEventListener('click', () => state.selectedId ? selectStory(state.selectedId) : clearForm());

$('#storyForm').addEventListener('submit', async event => {
  event.preventDefault();
  const paragraphs = $('#paragraphs').value.split(/\n\s*---\s*\n/).map(text => text.trim()).filter(Boolean);
  const payload = {
    title: $('#title').value,
    slug: $('#slug').value,
    story_type: $('#storyType').value,
    age: $('#age').value,
    category: $('#category').value,
    reading_minutes: Number($('#readingMinutes').value),
    color: $('#color').value,
    cover: $('#cover').value,
    summary: $('#summary').value,
    paragraphs,
    moral: $('#moral').value,
    tags: $('#tags').value.split(/[,，]/).map(tag => tag.trim()).filter(Boolean),
    cover_status: $('#coverStatus').value,
    source_note: $('#sourceNote').value,
    cover_prompt: $('#coverPrompt').value
  };
  const id = state.selectedId;
  try {
    const saved = await request(id ? `/admin/stories/${id}` : '/admin/stories', {
      method: id ? 'PUT' : 'POST', body: JSON.stringify(payload)
    });
    await refreshList(saved.id);
    $('#formMessage').className = '';
    $('#formMessage').textContent = '已保存到 MySQL，前端故事页刷新后即可读取。';
  } catch (error) {
    $('#formMessage').textContent = error.message;
    $('#formMessage').className = 'form-error';
  }
});

$('#deleteStory').addEventListener('click', async () => {
  if (!state.selectedId || !window.confirm('确定删除这篇内容吗？删除后前端将不再显示。')) return;
  try {
    await request(`/admin/stories/${state.selectedId}`, { method: 'DELETE' });
    clearForm();
    await refreshList();
  } catch (error) {
    $('#formMessage').textContent = error.message;
    $('#formMessage').className = 'form-error';
  }
});

refreshList();
