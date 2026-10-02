// Telegram WebApp Attendance App (v2.1 Ultimate Edition)
(function () {
  let appData = null;
  let activeSubject = 'all';
  let currentUserId = null;
  let searchQuery = '';
  let filterOnlyAbsents = false;
  let sortMode = 'alpha'; // 'alpha' | 'absences' | 'percent'

  // 1. Инициализация Telegram WebApp & Тематики
  function initTelegram() {
    if (window.Telegram && window.Telegram.WebApp) {
      const tg = window.Telegram.WebApp;
      tg.ready();
      tg.expand();
      document.body.classList.add('telegram-mode');

      syncTelegramTheme();
      tg.onEvent('themeChanged', syncTelegramTheme);

      if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
        currentUserId = tg.initDataUnsafe.user.id;
      }
    }

    // Параметр для тестирования на ПК в браузере ?user_id=...
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('user_id')) {
      currentUserId = parseInt(urlParams.get('user_id'), 10);
    }
  }

  function syncTelegramTheme() {
    const tg = window.Telegram && window.Telegram.WebApp;
    if (!tg) return;

    const isLight = tg.colorScheme === 'light';
    document.documentElement.setAttribute('data-theme', isLight ? 'light' : 'dark');

    if (tg.setHeaderColor) {
      tg.setHeaderColor(isLight ? '#ffffff' : '#0f172a');
    }
    if (tg.setBackgroundColor) {
      tg.setBackgroundColor(isLight ? '#f8fafc' : '#090d16');
    }
  }

  function triggerHaptic(type = 'light') {
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
      try {
        if (type === 'success' || type === 'error' || type === 'warning') {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred(type);
        } else {
          window.Telegram.WebApp.HapticFeedback.impactOccurred(type);
        }
      } catch (e) {}
    }
  }

  // 2. Получение приватного токена данных из хэша (#d=...)
  function resolveDataUrl() {
    const hash = window.location.hash.startsWith('#')
      ? window.location.hash.substring(1)
      : window.location.hash;
    const hashParams = new URLSearchParams(hash);
    const urlParams = new URLSearchParams(window.location.search);

    const dataToken = hashParams.get('d') || urlParams.get('d');

    // Локальная разработка (localhost / 127.0.0.1)
    if (!dataToken && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      return 'data/attendance.json';
    }

    if (!dataToken) {
      return null;
    }

    return `https://gist.githubusercontent.com/Derzkiyboomchik/${dataToken}/raw/attendance.json`;
  }

  // 3. Загрузка данных
  async function loadData() {
    const dataUrl = resolveDataUrl();

    if (!dataUrl) {
      document.getElementById('app-body').innerHTML = `
        <div class="state-box">
          <div class="state-icon">🔒</div>
          <p class="state-title">Доступ ограничен</p>
          <p class="state-desc">
            Ведомость открывается через официального Telegram-бота вашей группы с авторизованной ссылкой.
          </p>
        </div>
      `;
      return;
    }

    try {
      const resp = await fetch(dataUrl + '?v=' + Date.now());
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      appData = await resp.json();
      triggerHaptic('success');
      renderApp();
    } catch (err) {
      console.error('Failed to load attendance data:', err);
      document.getElementById('table-container').innerHTML = `
        <div class="state-box">
          <div class="state-icon">⚠️</div>
          <p class="state-title" style="color: var(--danger);">Ошибка загрузки</p>
          <p class="state-desc">
            Не удалось получить файл ведомости. Попробуйте нажать кнопку обновления в правом верхнем углу.
          </p>
        </div>
      `;
    }
  }

  // 4. Главный рендер
  function renderApp() {
    if (!appData) return;

    // Шапка: группа и время
    document.getElementById('group-title-text').textContent = appData.group_name || 'Группа';
    if (appData.updated_at) {
      const date = new Date(appData.updated_at);
      const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      const dateStr = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
      document.getElementById('update-time-text').textContent = `Обновлено: ${dateStr} ${timeStr}`;
    }

    // Подсчет общей явки группы
    calculateGroupRate();

    // Отрисовка табов предметов
    renderSubjectTabs();

    // Отрисовка баннера преподавателя
    updateTeacherBanner();

    // Проверка кнопки "Где я?"
    checkFindMeButton();

    // Отрисовка таблицы
    renderTable();
  }

  function calculateGroupRate() {
    const students = appData.students || [];
    if (students.length === 0) return;

    let totalPct = 0;
    students.forEach((s) => {
      totalPct += s.percent || 100;
    });
    const avg = Math.round(totalPct / students.length);
    const badge = document.getElementById('group-rate-badge');
    badge.textContent = `${avg}% явка`;
    if (avg < 80) {
      badge.style.background = 'var(--danger-bg)';
      badge.style.borderColor = 'var(--danger-border)';
      badge.style.color = 'var(--danger)';
    } else {
      badge.style.background = 'var(--success-bg)';
      badge.style.borderColor = 'var(--success-border)';
      badge.style.color = 'var(--success)';
    }
  }

  function checkFindMeButton() {
    const btnFindMe = document.getElementById('btn-find-me');
    if (!btnFindMe) return;

    const me = (appData.students || []).find((s) => currentUserId && s.telegram_id === currentUserId);
    btnFindMe.style.display = me ? 'flex' : 'none';
  }

  // 5. Отрисовка табов предметов
  function renderSubjectTabs() {
    const tabsContainer = document.getElementById('subject-tabs');
    tabsContainer.innerHTML = '';

    const subjects = appData.subjects || [];
    const tabs = [{ id: 'all', name: 'Сводная ведомость' }, ...subjects];

    tabs.forEach((subj) => {
      const btn = document.createElement('button');
      const isActive = activeSubject === subj.id;
      btn.className = `tab-btn ${isActive ? 'active' : ''}`;
      btn.innerHTML = `<span class="tab-dot"></span>${subj.name}`;
      btn.onclick = () => {
        if (activeSubject !== subj.id) {
          triggerHaptic('selection');
          activeSubject = subj.id;
          renderSubjectTabs();
          updateTeacherBanner();
          renderTable();
        }
      };
      tabsContainer.appendChild(btn);
    });
  }

  function updateTeacherBanner() {
    const banner = document.getElementById('teacher-banner');
    const teacherText = document.getElementById('teacher-name-text');
    const statsText = document.getElementById('teacher-stats-text');

    if (activeSubject === 'all') {
      banner.style.display = 'none';
      return;
    }

    const currentSubj = (appData.subjects || []).find((s) => s.id === activeSubject);
    if (currentSubj && currentSubj.teacher) {
      teacherText.textContent = currentSubj.teacher;

      // Считаем общее кол-во занятий по этому предмету
      const subjLessons = (appData.lessons || []).filter((l) => l.subject_id === activeSubject);
      statsText.textContent = `${subjLessons.length} пар`;

      banner.style.display = 'flex';
    } else {
      banner.style.display = 'none';
    }
  }

  // 6. Отрисовка таблицы
  function renderTable() {
    const tableContainer = document.getElementById('table-container');

    // 1. Фильтрация занятий по предмету
    let filteredLessons = appData.lessons || [];
    if (activeSubject !== 'all') {
      filteredLessons = filteredLessons.filter((l) => l.subject_id === activeSubject);
    }

    if (filteredLessons.length === 0) {
      tableContainer.innerHTML = `
        <div class="state-box">
          <div class="state-icon">📂</div>
          <p class="state-title">Нет занятий</p>
          <p class="state-desc">По выбранной дисциплине занятий не найдено.</p>
        </div>
      `;
      return;
    }

    // 2. Фильтрация и сортировка студентов
    const query = searchQuery.trim().toLowerCase();
    const records = appData.records || {};

    let filteredStudents = (appData.students || []).filter((student) => {
      if (query && !student.short_fio.toLowerCase().includes(query)) {
        return false;
      }
      if (filterOnlyAbsents && (!student.total_absences || student.total_absences === 0)) {
        return false;
      }
      return true;
    });

    // Сортировка
    if (sortMode === 'absences') {
      filteredStudents.sort((a, b) => (b.total_absences || 0) - (a.total_absences || 0));
    } else if (sortMode === 'percent') {
      filteredStudents.sort((a, b) => (a.percent || 0) - (b.percent || 0));
    } else {
      // По алфавиту
      filteredStudents.sort((a, b) => a.short_fio.localeCompare(b.short_fio, 'ru'));
    }

    document.getElementById('filtered-students-count').textContent =
      `Студентов: ${filteredStudents.length} из ${(appData.students || []).length}`;

    if (filteredStudents.length === 0) {
      tableContainer.innerHTML = `
        <div class="state-box">
          <div class="state-icon">🔍</div>
          <p class="state-title">Никого не найдено</p>
          <p class="state-desc">Попробуйте изменить запрос или сбросить фильтр.</p>
        </div>
      `;
      return;
    }

    // 3. Шапка таблицы
    let theadHtml = `
      <thead>
        <tr>
          <th class="sticky-col">Студент</th>
    `;

    const now = new Date();
    const todayStr = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}`;

    filteredLessons.forEach((lesson, lIdx) => {
      const isToday = lesson.date === todayStr;
      const pairText = lesson.pair_number ? `${lesson.pair_number} пара` : '';
      const typeShort = lesson.type ? shortenType(lesson.type) : '';

      theadHtml += `
        <th class="${isToday ? 'is-today-col' : ''}" id="col-lesson-${lesson.id}" data-date="${lesson.date}">
          <div class="date-cell-header">
            ${isToday ? '<span class="today-badge-text">СЕГОДНЯ</span>' : ''}
            <span class="date-day">${lesson.date || ''}</span>
            <span class="pair-num">${pairText}</span>
            ${typeShort ? `<span class="subj-tag">${typeShort}</span>` : ''}
          </div>
        </th>
      `;
    });

    theadHtml += `
          <th class="col-stat" title="Всего пропущено часов (неуваж.)">Проп.</th>
          <th class="col-stat" title="Уважительная причина (УП)">УП</th>
          <th class="col-stat" title="Процент явки">%</th>
        </tr>
      </thead>
    `;

    // 4. Строки студентов
    let tbodyHtml = '<tbody>';

    filteredStudents.forEach((student, sIdx) => {
      const isCurrent = currentUserId && student.telegram_id === currentUserId;
      tbodyHtml += `<tr class="${isCurrent ? 'is-current-user' : ''}" id="student-row-${student.id}">`;

      // Имя студента в первой колонке (кликабельное для карточки профиля)
      const nameHtml = highlightMatch(student.short_fio, query);
      tbodyHtml += `
        <td class="sticky-col" data-student-id="${student.id}" title="Нажмите, чтобы открыть карточку студента">
          <span class="st-num">${sIdx + 1}</span>
          <span class="st-name">${nameHtml}</span>
          ${isCurrent ? '<span class="you-pill">Вы</span>' : ''}
        </td>
      `;

      let studentMissed = 0;
      let studentExcused = 0;

      filteredLessons.forEach((lesson) => {
        const key = `${student.id}_${lesson.id}`;
        const mark = records[key] || '';
        const isToday = lesson.date === todayStr;

        let cellContent = '';

        if (mark) {
          const lower = mark.toString().toLowerCase();
          let badgeClass = 'badge-2';
          if (lower === '4') badgeClass = 'badge-4';
          else if (lower === 'уп' || lower === 'б') badgeClass = 'badge-уп';

          cellContent = `<span class="badge-mark ${badgeClass}">${mark}</span>`;

          if (mark === '2') studentMissed += 2;
          else if (mark === '4') studentMissed += 4;
          else if (lower === 'уп' || lower === 'б') studentExcused += 2;
        } else {
          cellContent = `<span class="dot-present">●</span>`;
        }

        tbodyHtml += `
          <td class="${isToday ? 'is-today-col' : ''}">
            <div class="cell-mark" data-student-id="${student.id}" data-lesson-id="${lesson.id}">
              ${cellContent}
            </div>
          </td>
        `;
      });

      // Итоговая статистика по выбранному срезу
      const totalLessonsCount = filteredLessons.length;
      const totalPossibleHours = totalLessonsCount * 2;
      let calculatedPercent = 100;
      if (totalPossibleHours > 0) {
        calculatedPercent = Math.max(0, Math.round(((totalPossibleHours - studentMissed) / totalPossibleHours) * 100));
      }

      const statClass = calculatedPercent < 80 ? 'stat-danger' : 'stat-ok';

      tbodyHtml += `
        <td class="col-stat ${studentMissed > 0 ? 'stat-danger' : ''}">${studentMissed > 0 ? studentMissed + 'ч' : '0'}</td>
        <td class="col-stat">${studentExcused > 0 ? studentExcused + 'ч' : '0'}</td>
        <td class="col-stat ${statClass}">${calculatedPercent}%</td>
      </tr>`;
    });

    tbodyHtml += '</tbody>';

    tableContainer.innerHTML = `
      <table class="attendance-grid">
        ${theadHtml}
        ${tbodyHtml}
      </table>
    `;

    // Привязываем события
    attachCellModalListeners(filteredLessons, filteredStudents);
    attachStudentProfileListeners(filteredStudents);
  }

  function shortenType(type) {
    if (!type) return '';
    const l = type.toLowerCase();
    if (l.includes('лек')) return 'лек';
    if (l.includes('лаб')) return 'лаб';
    if (l.includes('практ') || l.includes('сем')) return 'пр';
    return type.slice(0, 4);
  }

  function highlightMatch(text, query) {
    if (!query) return text;
    const idx = text.toLowerCase().indexOf(query);
    if (idx === -1) return text;
    const before = text.substring(0, idx);
    const match = text.substring(idx, idx + query.length);
    const after = text.substring(idx + query.length);
    return `${before}<mark style="background: rgba(var(--accent-rgb), 0.35); color: inherit; padding: 0 1px; border-radius: 2px;">${match}</mark>${after}`;
  }

  // 7. Детальное всплывающее окно ячейки (Bottom Sheet)
  function attachCellModalListeners(lessons, students) {
    const cells = document.querySelectorAll('.cell-mark');
    const backdrop = document.getElementById('cell-modal-backdrop');

    cells.forEach((cell) => {
      cell.onclick = () => {
        const studentId = parseInt(cell.getAttribute('data-student-id'), 10);
        const lessonId = parseInt(cell.getAttribute('data-lesson-id'), 10);

        const st = students.find((s) => s.id === studentId);
        const ls = lessons.find((l) => l.id === lessonId);
        if (!st || !ls) return;

        triggerHaptic('light');

        const key = `${st.id}_${ls.id}`;
        const mark = (appData.records || {})[key] || '';

        // Заполнение модального окна
        document.getElementById('m-subj-type').textContent = ls.type || 'Занятие';
        document.getElementById('m-subj-name').textContent = ls.subject_id || 'Дисциплина';

        const subjObj = (appData.subjects || []).find((s) => s.id === ls.subject_id);
        document.getElementById('m-teacher-name').textContent = subjObj && subjObj.teacher ? subjObj.teacher : 'Преподаватель не указан';

        document.getElementById('m-student-name').textContent = st.short_fio;
        document.getElementById('m-lesson-time').textContent = `${ls.date} · ${ls.pair_number ? ls.pair_number + ' пара' : ''}`;
        document.getElementById('m-lesson-clock').textContent = ls.time ? ls.time : 'По расписанию';

        const statusEl = document.getElementById('m-attendance-status');
        if (mark === '2') {
          statusEl.innerHTML = '<span class="badge-mark badge-2" style="padding: 4px 10px; font-size: 13px;">❌ Отсутствовал (2ч)</span>';
        } else if (mark === '4') {
          statusEl.innerHTML = '<span class="badge-mark badge-4" style="padding: 4px 10px; font-size: 13px;">❌ Отсутствовал (4ч)</span>';
        } else if (mark.toLowerCase() === 'уп' || mark.toLowerCase() === 'б') {
          statusEl.innerHTML = `<span class="badge-mark badge-уп" style="padding: 4px 10px; font-size: 13px;">🏥 Уважительная причина (${mark})</span>`;
        } else {
          statusEl.innerHTML = '<span style="color: var(--success); font-weight: 600;">✅ Присутствовал</span>';
        }

        backdrop.classList.add('show');
      };
    });
  }

  // 8. Карточка студента (Student Profile Sheet)
  function attachStudentProfileListeners(students) {
    const studentCols = document.querySelectorAll('tbody td.sticky-col');
    const backdrop = document.getElementById('student-modal-backdrop');

    studentCols.forEach((col) => {
      col.onclick = () => {
        const studentId = parseInt(col.getAttribute('data-student-id'), 10);
        const st = students.find((s) => s.id === studentId);
        if (!st) return;

        triggerHaptic('light');

        document.getElementById('sp-name').textContent = st.short_fio;
        document.getElementById('sp-subgroup').textContent = `${appData.group_name || 'Группа'} · ${st.subgroup ? 'Подгруппа ' + st.subgroup : 'Общая группа'}`;
        document.getElementById('sp-rate-percent').textContent = `${st.percent || 100}%`;
        document.getElementById('sp-total-abs').textContent = `${st.total_absences || 0}ч`;
        document.getElementById('sp-excused-abs').textContent = `${st.excused || 0}ч`;

        // Считаем пропуски по каждому предмету
        const records = appData.records || {};
        const subjMissed = {};

        (appData.lessons || []).forEach((ls) => {
          const key = `${st.id}_${ls.id}`;
          const mark = records[key];
          if (mark) {
            const h = mark === '4' ? 4 : 2;
            subjMissed[ls.subject_id] = (subjMissed[ls.subject_id] || 0) + h;
          }
        });

        const listContainer = document.getElementById('sp-subjects-breakdown');
        let listHtml = '';
        const subjKeys = Object.keys(subjMissed);

        if (subjKeys.length === 0) {
          listHtml = '<div style="font-size: 12px; color: var(--success); text-align: center; padding: 10px 0;">🎉 Нет пропущенных занятий!</div>';
        } else {
          subjKeys.sort((a, b) => subjMissed[b] - subjMissed[a]);
          subjKeys.forEach((sName) => {
            listHtml += `
              <div class="sp-subj-row">
                <span class="sp-subj-name" title="${sName}">${sName}</span>
                <span class="sp-subj-badge badge-2">${subjMissed[sName]}ч</span>
              </div>
            `;
          });
        }

        listContainer.innerHTML = listHtml;
        backdrop.classList.add('show');
      };
    });
  }

  function closeAllModals() {
    triggerHaptic('light');
    document.querySelectorAll('.modal-backdrop').forEach((m) => m.classList.remove('show'));
  }

  // 9. Навешивание обработчиков UI (Поиск, фильтры, жесты)
  function initUIEvents() {
    // Поиск
    const searchInput = document.getElementById('student-search-input');
    const clearBtn = document.getElementById('btn-clear-search');

    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      clearBtn.style.display = searchQuery ? 'flex' : 'none';
      renderTable();
    });

    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      searchQuery = '';
      clearBtn.style.display = 'none';
      renderTable();
    });

    // Фильтр только с пропусками
    const filterAbsBtn = document.getElementById('filter-absents-btn');
    filterAbsBtn.addEventListener('click', () => {
      triggerHaptic('selection');
      filterOnlyAbsents = !filterOnlyAbsents;
      filterAbsBtn.classList.toggle('active', filterOnlyAbsents);
      renderTable();
    });

    // Кнопка "Где я?"
    const btnFindMe = document.getElementById('btn-find-me');
    btnFindMe.addEventListener('click', () => {
      triggerHaptic('medium');
      if (!currentUserId || !appData) return;
      const me = (appData.students || []).find((s) => s.telegram_id === currentUserId);
      if (!me) return;

      const row = document.getElementById(`student-row-${me.id}`);
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.classList.remove('row-pulsing');
        void row.offsetWidth; // trigger reflow
        row.classList.add('row-pulsing');
      }
    });

    // Кнопка "Сегодня"
    const scrollTodayBtn = document.getElementById('btn-scroll-today');
    scrollTodayBtn.addEventListener('click', () => {
      triggerHaptic('light');
      const wrapper = document.querySelector('.table-wrapper');
      if (!wrapper) return;

      const now = new Date();
      const todayStr = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}`;
      const todayTh = document.querySelector(`th[data-date="${todayStr}"]`);

      if (todayTh) {
        todayTh.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      } else {
        // Если сегодня пар нет — скроллим к последней паре
        wrapper.scrollTo({ left: wrapper.scrollWidth, behavior: 'smooth' });
      }
    });

    // Переключение сортировки
    const btnSort = document.getElementById('btn-sort-toggle');
    const sortLabel = document.getElementById('sort-label');
    btnSort.addEventListener('click', () => {
      triggerHaptic('selection');
      if (sortMode === 'alpha') {
        sortMode = 'absences';
        sortLabel.textContent = '🔻 По пропускам';
      } else if (sortMode === 'absences') {
        sortMode = 'percent';
        sortLabel.textContent = '📈 По явке';
      } else {
        sortMode = 'alpha';
        sortLabel.textContent = '🔤 А-Я';
      }
      renderTable();
    });

    // Ручное переключение темы (День/Ночь)
    const themeBtn = document.getElementById('btn-theme-toggle');
    themeBtn.addEventListener('click', () => {
      triggerHaptic('light');
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
    });

    // Кнопка обновления
    const refreshBtn = document.getElementById('btn-refresh');
    refreshBtn.addEventListener('click', async () => {
      triggerHaptic('medium');
      refreshBtn.classList.add('spinning');
      await loadData();
      setTimeout(() => {
        refreshBtn.classList.remove('spinning');
      }, 600);
    });

    // Закрытие модальных окон по клику на кнопки и бэкдроп
    document.getElementById('btn-modal-close').addEventListener('click', closeAllModals);
    document.getElementById('btn-sp-modal-close').addEventListener('click', closeAllModals);

    document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
          closeAllModals();
        }
      });
    });

    // Поддержка жеста свайпа вниз для закрытия шторки (Swipe down to dismiss)
    setupSwipeToDismiss('cell-modal-sheet');
    setupSwipeToDismiss('student-modal-sheet');
  }

  function setupSwipeToDismiss(sheetId) {
    const sheet = document.getElementById(sheetId);
    if (!sheet) return;

    let startY = 0;
    let currentY = 0;

    sheet.addEventListener('touchstart', (e) => {
      startY = e.touches[0].clientY;
      currentY = startY;
    }, { passive: true });

    sheet.addEventListener('touchmove', (e) => {
      currentY = e.touches[0].clientY;
      const diff = currentY - startY;
      if (diff > 0) {
        sheet.style.transform = `translateY(${diff}px)`;
      }
    }, { passive: true });

    sheet.addEventListener('touchend', () => {
      const diff = currentY - startY;
      sheet.style.transform = '';
      if (diff > 80) {
        closeAllModals();
      }
    });
  }

  // 10. Запуск при загрузке страницы
  window.addEventListener('DOMContentLoaded', () => {
    initTelegram();
    initUIEvents();
    loadData();
  });
})();
