/**
 * CalOS Lesson System - Main Application
 * Privacy-first learning platform with local storage
 */

class CalOSLessonApp {
  constructor() {
    this.catalog = null;
    this.currentTrack = null;
    this.currentLesson = null;
    this.progress = this.loadProgress();

    this.init();
  }

  /**
   * Initialize the application
   */
  async init() {
    try {
      // Load lesson catalog
      await this.loadCatalog();

      // Update header stats
      this.updateHeaderStats();

      // Render initial view
      this.showTrackBrowser();

      // Handle browser navigation
      window.addEventListener('popstate', (e) => {
        if (e.state) {
          this.navigate(e.state);
        }
      });

      // Check URL for deep linking
      this.handleDeepLink();
    } catch (error) {
      console.error('Failed to initialize app:', error);
      this.showNotification('Failed to load lessons. Please refresh the page.', 'error');
    }
  }

  /**
   * Load lesson catalog from JSON
   */
  async loadCatalog() {
    try {
      const response = await fetch('lessons.json');
      this.catalog = await response.json();
    } catch (error) {
      console.error('Failed to load catalog:', error);
      throw error;
    }
  }

  /**
   * Load progress from localStorage
   */
  loadProgress() {
    const stored = localStorage.getItem('calos-lesson-progress');
    if (stored) {
      return JSON.parse(stored);
    }
    return {
      completedLessons: [],
      totalXP: 0,
      level: 1,
      achievements: [],
      lastAccessed: null
    };
  }

  /**
   * Save progress to localStorage
   */
  saveProgress() {
    localStorage.setItem('calos-lesson-progress', JSON.stringify(this.progress));
  }

  /**
   * Update header statistics
   */
  updateHeaderStats() {
    document.getElementById('total-xp').textContent = this.progress.totalXP;
    document.getElementById('completed-count').textContent = this.progress.completedLessons.length;
    document.getElementById('level').textContent = this.progress.level;
  }

  /**
   * Show notification toast
   */
  showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    const text = document.getElementById('notification-text');

    text.textContent = message;
    notification.className = `notification ${type}`;
    notification.classList.remove('hidden');

    setTimeout(() => {
      notification.classList.add('hidden');
    }, 3000);
  }

  /**
   * Show track browser view
   */
  showTrackBrowser() {
    this.hideAllViews();
    document.getElementById('track-browser').classList.add('active');
    this.renderTracks();
    this.renderAchievements();

    // Update URL
    history.pushState({ view: 'tracks' }, '', '#/');
  }

  /**
   * Show lesson list for a track
   */
  showLessonList(trackId) {
    const track = this.catalog.tracks.find(t => t.id === trackId);
    if (!track) return;

    this.currentTrack = track;

    this.hideAllViews();
    document.getElementById('lesson-list').classList.add('active');

    // Update track header
    document.getElementById('track-title').textContent = `${track.emoji} ${track.name}`;
    document.getElementById('track-description').textContent = track.description;

    // Render lessons
    this.renderLessons(track);

    // Update URL
    history.pushState({ view: 'lessons', trackId }, '', `#/${trackId}`);
  }

  /**
   * Show lesson viewer
   */
  async showLessonViewer(trackId, lessonId) {
    const track = this.catalog.tracks.find(t => t.id === trackId);
    if (!track) return;

    const lesson = track.lessons.find(l => l.id === lessonId);
    if (!lesson) return;

    this.currentTrack = track;
    this.currentLesson = lesson;

    this.hideAllViews();
    document.getElementById('lesson-viewer').classList.add('active');

    // Update lesson header
    document.getElementById('lesson-number').textContent = `Lesson ${lesson.number}`;
    document.getElementById('lesson-time').textContent = lesson.time;
    document.getElementById('lesson-xp').textContent = `${lesson.xp} XP`;
    document.getElementById('lesson-title').textContent = lesson.title;

    // Load lesson content
    await this.loadLessonContent(lesson);

    // Update navigation buttons
    this.updateLessonNavigation(track, lesson);

    // Update complete button
    const completeBtn = document.getElementById('complete-lesson');
    const isCompleted = this.isLessonCompleted(lessonId);
    completeBtn.textContent = isCompleted ? 'Completed' : 'Mark Complete & Claim XP';
    completeBtn.disabled = isCompleted;

    // Update URL
    history.pushState({ view: 'lesson', trackId, lessonId }, '', `#/${trackId}/${lessonId}`);

    // Scroll to top
    window.scrollTo(0, 0);
  }

  /**
   * Load lesson content from markdown file
   */
  async loadLessonContent(lesson) {
    const container = document.getElementById('lesson-markdown');

    try {
      const response = await fetch(lesson.file);
      const markdown = await response.text();

      // Simple markdown to HTML conversion
      container.innerHTML = this.markdownToHTML(markdown);
    } catch (error) {
      console.error('Failed to load lesson:', error);
      container.innerHTML = '<p class="text-muted">Failed to load lesson content. Please try again.</p>';
    }
  }

  /**
   * Simple markdown to HTML converter
   */
  markdownToHTML(markdown) {
    let html = markdown;

    // Code blocks
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');

    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Italic
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

    // Lists
    html = html.replace(/^\- (.*$)/gim, '<li>$1</li>');
    html = html.replace(/^\* (.*$)/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

    // Tables (basic support)
    const tableRegex = /\|(.+)\|\n\|[-:| ]+\|\n((?:\|.+\|\n?)+)/g;
    html = html.replace(tableRegex, (match, header, rows) => {
      const headerCells = header.split('|').filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join('');
      const bodyRows = rows.trim().split('\n').map(row => {
        const cells = row.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('');
        return `<tr>${cells}</tr>`;
      }).join('');
      return `<table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
    });

    // Blockquotes
    html = html.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');

    // Paragraphs
    html = html.split('\n\n').map(para => {
      if (para.startsWith('<') || para.trim() === '') return para;
      return `<p>${para}</p>`;
    }).join('\n');

    return html;
  }

  /**
   * Update lesson navigation buttons
   */
  updateLessonNavigation(track, lesson) {
    const prevBtn = document.getElementById('prev-lesson');
    const nextBtn = document.getElementById('next-lesson');

    const currentIndex = track.lessons.findIndex(l => l.id === lesson.id);

    // Previous button
    if (currentIndex > 0) {
      prevBtn.disabled = false;
    } else {
      prevBtn.disabled = true;
    }

    // Next button
    if (currentIndex < track.lessons.length - 1) {
      nextBtn.disabled = false;
    } else {
      nextBtn.disabled = true;
    }
  }

  /**
   * Navigate to previous/next lesson
   */
  navigateLesson(direction) {
    if (!this.currentTrack || !this.currentLesson) return;

    const currentIndex = this.currentTrack.lessons.findIndex(l => l.id === this.currentLesson.id);
    const newIndex = currentIndex + direction;

    if (newIndex >= 0 && newIndex < this.currentTrack.lessons.length) {
      const nextLesson = this.currentTrack.lessons[newIndex];
      this.showLessonViewer(this.currentTrack.id, nextLesson.id);
    }
  }

  /**
   * Complete current lesson
   */
  completeLesson() {
    if (!this.currentLesson) return;

    const lessonId = this.currentLesson.id;

    // Check if already completed
    if (this.isLessonCompleted(lessonId)) {
      this.showNotification('Lesson already completed!', 'error');
      return;
    }

    // Add to completed lessons
    this.progress.completedLessons.push(lessonId);
    this.progress.totalXP += this.currentLesson.xp;

    // Calculate level (100 XP per level)
    this.progress.level = Math.floor(this.progress.totalXP / 100) + 1;

    // Check for achievements
    this.checkAchievements();

    // Save progress
    this.saveProgress();

    // Update UI
    this.updateHeaderStats();

    // Disable complete button
    const completeBtn = document.getElementById('complete-lesson');
    completeBtn.textContent = 'Completed';
    completeBtn.disabled = true;

    // Show notification
    this.showNotification(`Lesson completed! +${this.currentLesson.xp} XP`, 'success');
  }

  /**
   * Check if lesson is completed
   */
  isLessonCompleted(lessonId) {
    return this.progress.completedLessons.includes(lessonId);
  }

  /**
   * Check if lesson is locked
   */
  isLessonLocked(lesson) {
    if (!lesson.prerequisites || lesson.prerequisites.length === 0) {
      return false;
    }

    return !lesson.prerequisites.every(prereq => this.isLessonCompleted(prereq));
  }

  /**
   * Open lab in iframe
   */
  openLab() {
    if (!this.currentLesson || !this.currentLesson.lab) return;

    const container = document.getElementById('lab-container');
    const iframe = document.getElementById('lab-iframe');

    iframe.src = this.currentLesson.lab;
    container.classList.remove('hidden');

    // Scroll to lab
    container.scrollIntoView({ behavior: 'smooth' });
  }

  /**
   * Close lab iframe
   */
  closeLab() {
    const container = document.getElementById('lab-container');
    const iframe = document.getElementById('lab-iframe');

    iframe.src = '';
    container.classList.add('hidden');
  }

  /**
   * Check and unlock achievements
   */
  checkAchievements() {
    const achievements = this.catalog.achievements;

    achievements.forEach(achievement => {
      if (this.progress.achievements.includes(achievement.id)) return;

      let unlocked = false;

      switch (achievement.id) {
        case 'first-lesson':
          unlocked = this.progress.completedLessons.length >= 1;
          break;
        case 'track-complete':
          unlocked = this.catalog.tracks.some(track =>
            track.lessons.every(lesson => this.isLessonCompleted(lesson.id))
          );
          break;
        case 'all-tracks':
          unlocked = this.catalog.tracks.every(track =>
            track.lessons.every(lesson => this.isLessonCompleted(lesson.id))
          );
          break;
        case 'lab-master':
          unlocked = this.progress.completedLessons.length >= 10;
          break;
        case 'speedrun':
          // Check if 5 lessons completed today
          const today = new Date().toDateString();
          const todayLessons = this.progress.completedLessons.filter(lessonId => {
            const lesson = this.catalog.tracks.flatMap(t => t.lessons).find(l => l.id === lessonId);
            return lesson && new Date(lesson.completedAt || Date.now()).toDateString() === today;
          });
          unlocked = todayLessons.length >= 5;
          break;
        case 'perfect-score':
          // This would require quiz tracking - placeholder
          unlocked = false;
          break;
      }

      if (unlocked) {
        this.unlockAchievement(achievement);
      }
    });
  }

  /**
   * Unlock achievement
   */
  unlockAchievement(achievement) {
    this.progress.achievements.push(achievement.id);
    this.progress.totalXP += achievement.xp;
    this.saveProgress();

    this.showNotification(
      `Achievement Unlocked: ${achievement.name} (+${achievement.xp} XP)`,
      'success'
    );
  }

  /**
   * Render tracks in track browser
   */
  renderTracks() {
    const container = document.getElementById('tracks-container');
    container.innerHTML = '';

    this.catalog.tracks.forEach(track => {
      const completedLessons = track.lessons.filter(l => this.isLessonCompleted(l.id)).length;
      const totalLessons = track.lessons.length;
      const progressPercent = (completedLessons / totalLessons) * 100;

      const earnedXP = track.lessons
        .filter(l => this.isLessonCompleted(l.id))
        .reduce((sum, l) => sum + l.xp, 0);

      const card = document.createElement('div');
      card.className = 'track-card';
      card.style.setProperty('--track-color', track.color);
      card.onclick = () => this.showLessonList(track.id);

      card.innerHTML = `
        <span class="track-emoji">${track.emoji}</span>
        <h3 class="track-name">${track.name}</h3>
        <p class="track-description">${track.description}</p>
        <div class="track-stats">
          <span>${totalLessons} lessons</span>
          <span>${track.xp} XP</span>
        </div>
        <div class="track-progress-indicator">
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${progressPercent}%"></div>
          </div>
          <div class="progress-stats">
            <span>${completedLessons}/${totalLessons} complete</span>
            <span>${earnedXP}/${track.xp} XP</span>
          </div>
        </div>
      `;

      container.appendChild(card);
    });
  }

  /**
   * Render lessons in lesson list
   */
  renderLessons(track) {
    const container = document.getElementById('lessons-container');
    container.innerHTML = '';

    // Update track progress bar
    const completedLessons = track.lessons.filter(l => this.isLessonCompleted(l.id)).length;
    const totalLessons = track.lessons.length;
    const progressPercent = (completedLessons / totalLessons) * 100;

    document.getElementById('track-progress-fill').style.width = `${progressPercent}%`;
    document.getElementById('track-progress-text').textContent = `${completedLessons}/${totalLessons} lessons complete`;

    const earnedXP = track.lessons
      .filter(l => this.isLessonCompleted(l.id))
      .reduce((sum, l) => sum + l.xp, 0);
    document.getElementById('track-xp-text').textContent = `${earnedXP}/${track.xp} XP`;

    // Render lesson cards
    track.lessons.forEach(lesson => {
      const isCompleted = this.isLessonCompleted(lesson.id);
      const isLocked = this.isLessonLocked(lesson);

      const card = document.createElement('div');
      card.className = `lesson-card ${isCompleted ? 'completed' : ''} ${isLocked ? 'locked' : ''}`;

      if (!isLocked) {
        card.onclick = () => this.showLessonViewer(track.id, lesson.id);
      }

      card.innerHTML = `
        <div class="lesson-card-number">${lesson.number}</div>
        <div class="lesson-card-content">
          <div class="lesson-card-title">${lesson.title}</div>
          <div class="lesson-card-meta">
            <span>${lesson.time}</span>
            <span>${lesson.xp} XP</span>
          </div>
        </div>
        <div class="lesson-card-status">
          ${isCompleted ? '<span class="status-badge completed">Completed</span>' : ''}
          ${isLocked ? '<span class="status-badge locked">Locked</span>' : ''}
        </div>
      `;

      container.appendChild(card);
    });
  }

  /**
   * Render achievements
   */
  renderAchievements() {
    const container = document.getElementById('achievements-container');
    container.innerHTML = '';

    this.catalog.achievements.forEach(achievement => {
      const isUnlocked = this.progress.achievements.includes(achievement.id);

      const card = document.createElement('div');
      card.className = `achievement-card ${isUnlocked ? 'unlocked' : 'locked'}`;

      card.innerHTML = `
        <span class="achievement-icon">${achievement.icon}</span>
        <div class="achievement-name">${achievement.name}</div>
        <div class="achievement-description">${achievement.description}</div>
        <div class="achievement-xp">+${achievement.xp} XP</div>
      `;

      container.appendChild(card);
    });
  }

  /**
   * Back to lesson list
   */
  backToLessonList() {
    if (this.currentTrack) {
      this.showLessonList(this.currentTrack.id);
      this.closeLab();
    }
  }

  /**
   * Hide all views
   */
  hideAllViews() {
    document.querySelectorAll('.view').forEach(view => {
      view.classList.remove('active');
    });
  }

  /**
   * Handle navigation
   */
  navigate(state) {
    if (!state) return;

    switch (state.view) {
      case 'tracks':
        this.showTrackBrowser();
        break;
      case 'lessons':
        this.showLessonList(state.trackId);
        break;
      case 'lesson':
        this.showLessonViewer(state.trackId, state.lessonId);
        break;
    }
  }

  /**
   * Handle deep linking from URL
   */
  handleDeepLink() {
    const hash = window.location.hash.slice(1);
    if (!hash || hash === '/') return;

    const parts = hash.split('/').filter(p => p);

    if (parts.length === 1) {
      // Track view
      this.showLessonList(parts[0]);
    } else if (parts.length === 2) {
      // Lesson view
      this.showLessonViewer(parts[0], parts[1]);
    }
  }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.app = new CalOSLessonApp();
  });
} else {
  window.app = new CalOSLessonApp();
}
