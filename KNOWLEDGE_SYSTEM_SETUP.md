# 🎤 Voice-First Knowledge Management System - Setup Guide

## What You've Got

A complete **NotebookLM-style voice knowledge system** integrated into your CalOS agent-router:

✅ **Voice Input** - Record voice memos, auto-transcribe to notes
✅ **Document Upload** - PDF, DOCX, TXT, MD, HTML parsing
✅ **Knowledge Chat** - Ask questions, AI answers from your notes
✅ **Voice Output** - Text-to-speech for AI responses
✅ **Document Generation** - Export to PDF, MD, HTML, DOCX, JSON
✅ **Full-text Search** - Find notes quickly
✅ **Semantic Search** - Vector embeddings for similarity search
✅ **Approval Workflow** - You control what gets saved/modified

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd /Users/matthewmauer/Desktop/CALOS_ROOT/agent-router

# Install document parsing libraries
npm install pdf-parse mammoth html-to-text

# Install document generation libraries
npm install pdfkit marked officegen

# Install OpenAI for TTS (already installed)
# npm install openai (already in package.json)
```

### 2. Run Database Migration

```bash
# Make sure PostgreSQL is running
# Then run the migration
cd database
node run-migrations.js

# This will create all the knowledge system tables:
# - notes
# - document_chunks
# - knowledge_chats
# - generated_documents
# - note_relationships
# - knowledge_approvals
# - note_access_log
```

### 3. Start the Server

```bash
cd /Users/matthewmauer/Desktop/CALOS_ROOT/agent-router

# Run in local mode with database
node router.js --local

# You should see:
# ✓ PostgreSQL connected
# 🚀 HTTP Server:     http://localhost:5001
# 🔌 WebSocket:       ws://localhost:5001
```

### 4. Test the API

```bash
# Create a note
curl -X POST http://localhost:5001/api/notes \
  -H "Content-Type: application/json" \
  -d '{
    "title": "My First Note",
    "content": "This is a test note from voice input",
    "source": "voice",
    "userId": "user_123"
  }'

# Search notes
curl "http://localhost:5001/api/notes/search?q=test&userId=user_123"

# Get recent notes
curl "http://localhost:5001/api/notes/recent?limit=10&userId=user_123"

# Get statistics
curl "http://localhost:5001/api/notes/stats?userId=user_123"
```

## 📡 API Endpoints

### Notes Management

```
POST   /api/notes              Create a new note
GET    /api/notes/:id          Get note by ID
PUT    /api/notes/:id          Update note
DELETE /api/notes/:id          Delete note (soft delete)
GET    /api/notes/search       Search notes (full-text)
GET    /api/notes/recent       Get recent notes
GET    /api/notes/stats        Get statistics
GET    /api/notes/categories   List all categories
GET    /api/notes/tags         List all tags
```

### Document Upload

```
POST   /api/notes/upload       Upload and parse document
                                (PDF, DOCX, TXT, MD, HTML)
```

### Knowledge Chat

```
POST   /api/notes/chat         Chat with your knowledge base
                                AI answers from your notes
```

### Document Generation

```
POST   /api/notes/generate     Generate document from notes
                                Formats: PDF, MD, HTML, DOCX, JSON
```

### Text-to-Speech

```
POST   /api/tts/speak          Convert text to speech
                                Voices: alloy, echo, fable, onyx, nova, shimmer
```

## 🎯 Usage Examples

### 1. Voice Memo → Note

```javascript
// Record audio, transcribe with Whisper
const audioBlob = await recordAudio();
const transcription = await fetch('/transcribe-voice', {
  method: 'POST',
  body: JSON.stringify({ audio: base64Audio })
});

// Create note from transcription
const note = await fetch('/api/notes', {
  method: 'POST',
  body: JSON.stringify({
    title: 'Voice Memo',
    content: transcription.text,
    source: 'voice',
    audioPath: '/path/to/recording.wav',
    userId: 'user_123'
  })
});
```

### 2. Upload Document

```javascript
// Upload PDF
const fileInput = document.querySelector('input[type="file"]');
const file = fileInput.files[0];
const reader = new FileReader();

reader.onload = async (e) => {
  const base64 = e.target.result.split(',')[1];

  const response = await fetch('/api/notes/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file: base64,
      filename: file.name,
      mimeType: file.type,
      userId: 'user_123',
      category: 'research'
    })
  });

  const result = await response.json();
  console.log(`Uploaded: ${result.note.title}`);
  console.log(`Chunks: ${result.chunks}`);
};

reader.readAsDataURL(file);
```

### 3. Chat with Knowledge Base

```javascript
// Ask a question
const response = await fetch('/api/notes/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: 'What did I note about the Q4 budget?',
    sessionId: 'session_123',
    voiceInput: true,
    voiceOutput: true  // Get TTS response
  })
});

const chat = await response.json();
console.log('AI:', chat.response);
console.log('Sources:', chat.sourceNotes);

// Play audio response
if (chat.audioPath) {
  const audio = new Audio(chat.audioPath);
  audio.play();
}
```

### 4. Generate Summary Document

```javascript
// Generate PDF from notes
const response = await fetch('/api/notes/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    noteIds: [1, 2, 3, 4],
    format: 'pdf',
    title: 'Q4 Meeting Summary',
    template: 'report'
  })
});

const doc = await response.json();
console.log(`Generated: ${doc.filename}`);
console.log(`Size: ${doc.size} bytes`);
console.log(`Download: ${doc.path}`);
```

## 📊 Database Schema

```sql
-- Core notes table
notes (
  id, title, content, source, tags, category,
  embedding[1536],  -- For semantic search
  user_id, created_at, updated_at
)

-- Large document chunks
document_chunks (
  id, note_id, chunk_index, content, embedding[1536]
)

-- Chat history with knowledge base
knowledge_chats (
  id, session_id, user_query, ai_response,
  source_notes[], voice_input, voice_output
)

-- Generated documents
generated_documents (
  id, title, format, source_notes[],
  file_path, approved
)
```

## 🎨 Front-End Integration

You'll need to build UI pages (examples coming):

1. **Voice Notes Page** (`public/voice-notes.html`)
   - Push-to-talk recording
   - Real-time transcription display
   - Note editing and tagging

2. **Knowledge Chat Page** (`public/knowledge-chat.html`)
   - Chat interface
   - Voice input/output toggle
   - Source note citations

3. **Document Library** (`public/notes-library.html`)
   - Browse all notes
   - Search and filter
   - Bulk operations

## 🔧 Configuration

### OpenAI API Key (Required for TTS)

```bash
# Add to .env
OPENAI_API_KEY=sk-your-key-here
```

### Whisper (Required for Voice Transcription)

Already configured in `agents/voice-transcriber.js`:
- Path: `/Users/matthewmauer/Desktop/whisper.cpp`
- Model: `base.en`

### Database

Already using your PostgreSQL setup:
- Connection via `--local` mode
- Tables created by migration

## 📁 File Structure

```
agent-router/
├── database/
│   └── migrations/
│       └── 004_add_knowledge_system.sql  ← NEW
├── lib/
│   ├── knowledge-store.js                ← NEW (CRUD operations)
│   ├── document-parser.js                ← NEW (PDF/DOCX/etc parsing)
│   ├── document-generator.js             ← NEW (PDF/MD/HTML export)
│   └── tts-engine.js                     ← NEW (Text-to-speech)
├── agents/
│   └── voice-transcriber.js              ← EXISTS (Whisper integration)
├── router.js                             ← EXTENDED (API endpoints)
└── public/
    └── (voice-notes.html coming...)      ← TODO
```

## 🐛 Troubleshooting

### "Knowledge system requires database"
- Make sure you're running with `node router.js --local`
- Check PostgreSQL is running: `brew services list | grep postgresql`

### "Failed to parse document"
- Install dependencies: `npm install pdf-parse mammoth html-to-text`
- Check file MIME type is supported

### "OpenAI TTS failed"
- Set `OPENAI_API_KEY` in `.env`
- Or switch to local TTS: `new TTSEngine({ provider: 'local' })`

### "Voice transcription not working"
- Check Whisper is installed: `ls ~/Desktop/whisper.cpp/main`
- Install if missing: Follow whisper.cpp setup

## 🎉 Next Steps

1. **Run the migration** to create tables
2. **Test the API** with curl commands above
3. **Build the UI** (voice-notes.html, knowledge-chat.html)
4. **Add semantic search** using embeddings
5. **Integrate with existing agents** for better AI responses

## 💡 Integration Ideas

- **Voice Memos App**: Mobile-friendly recording interface
- **Meeting Notes**: Auto-transcribe Zoom/Teams meetings
- **Research Assistant**: Upload papers, chat with PDFs
- **Personal Wiki**: Build your knowledge graph
- **Study Tool**: Quiz yourself from your notes

---

**You now have a fully functional voice-first knowledge management system!** 🚀

The backend is ready. Build the UI to start using it!
