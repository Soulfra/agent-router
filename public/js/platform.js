/**
 * CalOS Platform JavaScript
 * Handles panel switching, API calls, and UI interactions
 */

// ============================================================================
// Panel Management
// ============================================================================

function switchPanel(panelName, clickEvent) {
  // Hide all panels
  const panels = document.querySelectorAll('.panel');
  panels.forEach(panel => panel.classList.remove('active'));

  // Remove active from all nav items
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => item.classList.remove('active'));

  // Show selected panel
  const targetPanel = document.getElementById(`${panelName}Panel`);
  if (targetPanel) {
    targetPanel.classList.add('active');
  }

  // Activate nav item (use currentTarget to get the clicked element)
  if (clickEvent && clickEvent.currentTarget) {
    clickEvent.currentTarget.classList.add('active');
  }
}

// ============================================================================
// Brand Presentation Generator
// ============================================================================

let currentBrand = 'calos';
let currentTemplate = 'pitchDeck';
let currentFormat = 'pdf';
let generatedSlides = null;

function selectBrand(brand) {
  currentBrand = brand;

  // Update UI
  document.querySelectorAll('.brand-option').forEach(el => {
    el.classList.remove('active');
  });
  event.target.closest('.brand-option').classList.add('active');
}

function selectTemplate(template) {
  currentTemplate = template;

  // Update UI
  document.querySelectorAll('.template-option').forEach(el => {
    el.classList.remove('active');
  });
  event.target.closest('.template-option').classList.add('active');
}

function selectFormat(format) {
  currentFormat = format;

  // Update radio button
  document.querySelectorAll('input[name="format"]').forEach(input => {
    input.checked = (input.value === format);
  });
}

async function generatePresentation() {
  const generateBtn = document.getElementById('generateBtn');
  const previewArea = document.getElementById('previewArea');
  const statusDiv = document.getElementById('generationStatus');

  try {
    // Disable button
    generateBtn.disabled = true;
    generateBtn.textContent = 'Generating...';

    // Show status
    statusDiv.innerHTML = `
      <div style="padding: 1rem; background: rgba(0, 128, 255, 0.1); border-radius: 8px; color: var(--accent-blue);">
        🎨 Generating ${currentTemplate} for ${currentBrand}...
      </div>
    `;

    // Call API
    const response = await fetch('/api/brand-presentation/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brand: currentBrand,
        template: currentTemplate,
        format: currentFormat
      })
    });

    if (!response.ok) {
      throw new Error(`Generation failed: ${response.statusText}`);
    }

    const result = await response.json();
    generatedSlides = result;

    // Show success
    statusDiv.innerHTML = `
      <div style="padding: 1rem; background: rgba(0, 255, 136, 0.1); border-radius: 8px; color: var(--accent-green);">
        ✅ Generated ${result.slides.length} slides successfully!
      </div>
    `;

    // Render preview
    renderPresentationPreview(result);

  } catch (error) {
    console.error('Generation error:', error);
    statusDiv.innerHTML = `
      <div style="padding: 1rem; background: rgba(255, 68, 68, 0.1); border-radius: 8px; color: var(--accent-red);">
        ❌ Error: ${error.message}
      </div>
    `;
  } finally {
    // Re-enable button
    generateBtn.disabled = false;
    generateBtn.textContent = 'Generate Presentation';
  }
}

function renderPresentationPreview(result) {
  const previewArea = document.getElementById('previewArea');

  if (!result || !result.slides || result.slides.length === 0) {
    previewArea.innerHTML = '<p style="color: var(--text-secondary);">No slides to preview</p>';
    return;
  }

  // Render slide thumbnails with actual images
  let html = '<div class="slides-grid">';

  result.slides.forEach((slide, index) => {
    const slideNum = index + 1;
    const slideImageUrl = `/api/brand-presentation/slide/${result.id}/${slideNum}`;

    html += `
      <div class="slide-thumbnail" onclick="viewSlideDetail(${index})">
        <div class="slide-number">${slideNum}</div>
        <div class="slide-preview">
          <img src="${slideImageUrl}"
               alt="Slide ${slideNum}"
               style="width: 100%; height: auto; border-radius: 4px; margin-bottom: 8px;"
               onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
          <div style="display: none; padding: 20px; text-align: center; color: var(--text-secondary);">
            <h4>${slide.title || 'Slide ' + slideNum}</h4>
            <p>${slide.subtitle || ''}</p>
          </div>
        </div>
      </div>
    `;
  });

  html += '</div>';

  // Add download buttons for all formats
  html += `
    <div style="margin-top: 2rem;">
      <h3 style="margin-bottom: 1rem; color: var(--text-primary);">Download Options</h3>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
        <button class="btn btn-primary" onclick="downloadFormat('pdf')">
          📄 PDF (Slides)
        </button>
        <button class="btn btn-primary" onclick="downloadFormat('gif')">
          🎞️ GIF (Animated)
        </button>
        <button class="btn btn-primary" onclick="downloadFormat('mp4')">
          🎬 MP4 (Video)
        </button>
        <button class="btn btn-secondary" onclick="downloadFormat('markdown')">
          📝 Markdown (Text)
        </button>
      </div>
    </div>
  `;

  previewArea.innerHTML = html;
}

async function downloadFormat(format) {
  if (!generatedSlides || !generatedSlides.id) {
    alert('No presentation generated yet');
    return;
  }

  try {
    // Download the file
    const url = `/api/brand-presentation/download/${generatedSlides.id}?format=${format}`;
    window.location.href = url;
  } catch (error) {
    console.error('Download error:', error);
    alert(`Failed to download: ${error.message}`);
  }
}

function viewSlideDetail(slideIndex) {
  if (!generatedSlides || !generatedSlides.slides[slideIndex]) {
    return;
  }

  const slide = generatedSlides.slides[slideIndex];

  // Show modal with slide details
  alert(`Slide ${slideIndex + 1}\n\n${slide.title}\n${slide.subtitle || ''}\n\n${JSON.stringify(slide.content, null, 2)}`);
}

async function downloadPresentation() {
  if (!generatedSlides) {
    alert('Please generate a presentation first');
    return;
  }

  try {
    const response = await fetch(`/api/brand-presentation/download/${generatedSlides.id}?format=${currentFormat}`);

    if (!response.ok) {
      throw new Error('Download failed');
    }

    // Get filename from response headers
    const contentDisposition = response.headers.get('Content-Disposition');
    let filename = `${currentBrand}-${currentTemplate}.${currentFormat}`;

    if (contentDisposition) {
      const match = contentDisposition.match(/filename="(.+)"/);
      if (match) {
        filename = match[1];
      }
    }

    // Download file
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

  } catch (error) {
    console.error('Download error:', error);
    alert('Failed to download: ' + error.message);
  }
}

async function exportMarkdown() {
  if (!generatedSlides) {
    alert('Please generate a presentation first');
    return;
  }

  try {
    const response = await fetch(`/api/brand-presentation/download/${generatedSlides.id}?format=markdown`);

    if (!response.ok) {
      throw new Error('Export failed');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentBrand}-${currentTemplate}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

  } catch (error) {
    console.error('Export error:', error);
    alert('Failed to export markdown: ' + error.message);
  }
}

// ============================================================================
// Project Management (placeholder for future implementation)
// ============================================================================

function showCreateProjectModal() {
  const modal = document.getElementById('createProjectModal');
  if (modal) {
    modal.style.display = 'flex';
  }
}

function hideCreateProjectModal() {
  const modal = document.getElementById('createProjectModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

async function createProject() {
  // TODO: Implement project creation
  alert('Project creation not yet implemented');
  hideCreateProjectModal();
}

// ============================================================================
// API Key Management (placeholder for future implementation)
// ============================================================================

function showAddKeyModal() {
  const modal = document.getElementById('addKeyModal');
  if (modal) {
    modal.style.display = 'flex';
  }
}

function hideAddKeyModal() {
  const modal = document.getElementById('addKeyModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

async function addApiKey() {
  // TODO: Implement API key addition
  alert('API key management not yet implemented');
  hideAddKeyModal();
}

function deleteApiKey(keyId) {
  if (confirm('Are you sure you want to delete this API key?')) {
    // TODO: Implement API key deletion
    alert('API key deletion not yet implemented');
  }
}

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('CalOS Platform initialized');

  // Load initial data if needed
  // loadProjects();
  // loadApiKeys();
  // loadUsageStats();
});
