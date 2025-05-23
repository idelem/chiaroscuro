// Main app controller
class Chiaroscuro {
    constructor() {
        // DOM elements
        this.plotColumn = document.getElementById('plot-column');
        this.subtextColumn = document.getElementById('subtext-column');
        this.divider = document.getElementById('divider');
        this.plotContent = document.getElementById('plot-content');
        this.subtextContent = document.getElementById('subtext-content');
        this.sectionLabelModal = document.getElementById('section-label-modal');
        this.sectionLabelInput = document.getElementById('section-label-input');
        this.saveSectionBtn = document.getElementById('save-section-label');
        this.cancelSectionBtn = document.getElementById('cancel-section-label');
        this.saveBtn = document.getElementById('save-btn');
        this.exportBtn = document.getElementById('export-btn');
        this.importBtn = document.getElementById('import-btn');
        this.clearBtn = document.getElementById('clear-btn');

        // State
        this.notes = [];
        this.sections = [];
        this.activeNote = null;
        this.activeDot = null;
        this.tempSectionY = null;
        this.tempSectionElement = null;
        this.isResizing = false;
        this.isDragging = false;
        this.lastMousePosition = { x: 0, y: 0 };
        this.deletedNotes = [];
        this.deletedSections = [];
        this.currentActiveNote = null;

        // Initialize
        this.setupEventListeners();
        this.loadFromLocalStorage();
    }

    setupEventListeners() {
        // Click events for columns to add notes
        this.plotContent.addEventListener('dblclick', (e) => this.handleColumnClick(e, 'plot'));
        this.subtextContent.addEventListener('dblclick', (e) => this.handleColumnClick(e, 'subtext'));

        // Click event for divider to add sections
        this.divider.addEventListener('click', (e) => this.handleDividerClick(e));

        // Modal events
        this.saveSectionBtn.addEventListener('click', () => this.saveSection());
        this.cancelSectionBtn.addEventListener('click', () => this.closeModal());

        // Storage and export/import events
        this.saveBtn.addEventListener('click', () => this.saveToLocalStorage());
        this.exportBtn.addEventListener('click', () => this.exportData());
        this.importBtn.addEventListener('click', () => this.importData());
        this.clearBtn.addEventListener('click', () => this.clearAll());

        // Global events for dragging
        document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        document.addEventListener('mouseup', () => this.handleMouseUp());

        // Auto-save every 30 seconds
        setInterval(() => this.saveToLocalStorage(), 30000);

        //delete and undo events
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Delete' && this.currentActiveNote) {
                this.deleteNote(this.currentActiveNote.noteId);
                this.currentActiveNote = null;
            } else if (e.ctrlKey && e.key === 'z') {
                e.preventDefault();
                this.undoDelete();
            }
        });

        // Add right-click context menu for notes
        document.addEventListener('contextmenu', (e) => {
            const note = e.target.closest('.note');
            if (note) {
                e.preventDefault();
                this.deleteNote(note.id);
            }
        });
    }

    handleColumnClick(e, columnType) {
        // Don't create a note if clicked on an existing note
        if (e.target.closest('.note') || e.target.closest('.note-dot')) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        this.createNote(x, y, columnType);
    }

    createNote(x, y, columnType) {
        // Create a unique ID for the note
        const noteId = `note-${Date.now()}`;
        const dotId = `dot-${Date.now()}`;

        // Calculate dot position on divider
        const dividerRect = this.divider.getBoundingClientRect();
        const columnRect = columnType === 'plot' 
            ? this.plotContent.getBoundingClientRect() 
            : this.subtextContent.getBoundingClientRect();
        
        const dotY = y + this.plotContent.scrollTop;
        const dotX = columnType === 'plot' 
            ? dividerRect.left - columnRect.left 
            : 0; // For subtext, dot is on left edge of divider

        // Create note
        const note = document.createElement('div');
        note.className = 'note';
        note.id = noteId;
        note.style.left = `${x}px`;
        note.style.top = `${y}px`;

        // Create textarea inside note
        const textarea = document.createElement('textarea');
        textarea.placeholder = columnType === 'plot' ? 'Add plot point...' : 'Add subtext...';
        textarea.addEventListener('input', () => this.updateConnectionLine(dotId, noteId));
        note.appendChild(textarea);

        // Create dot on divider
        const dot = document.createElement('div');
        dot.className = 'note-dot';
        dot.id = dotId;
        dot.style.left = columnType === 'plot' ? '100%' : '0';
        dot.style.top = `${dotY}px`;
        
        // Set up dragging for dot
        dot.addEventListener('mousedown', (e) => {
            this.startDragDot(e, dotId, noteId);
            e.stopPropagation();
        });

        // Set up dragging for note and track active note
        note.addEventListener('mousedown', (e) => {
            if (e.target === note || e.target.tagName !== 'TEXTAREA') {
                this.startDragNote(e, noteId, dotId);
                e.preventDefault();
            }
            // Set this note as active for deletion
            this.setActiveNote(noteId, dotId);
        });

        // Also track when textarea gets focus
        note.querySelector('textarea').addEventListener('focus', () => {
            this.setActiveNote(noteId, dotId);
        });

        // Create connection line
        const line = document.createElement('div');
        line.className = 'connection-line';
        line.id = `line-${dotId}`;

        // Add elements to DOM
        if (columnType === 'plot') {
            this.plotContent.appendChild(note);
            this.divider.appendChild(dot);
        } else {
            this.subtextContent.appendChild(note);
            this.divider.appendChild(dot);
        }
        document.body.appendChild(line);

        // Store note data
        this.notes.push({
            noteId,
            dotId,
            lineId: `line-${dotId}`,
            columnType,
            text: '',
            position: { x, y },
            dotPosition: dotY
        });

        // Set focus to textarea
        textarea.focus();

        // Update connection line
        this.updateConnectionLine(dotId, noteId);

        return noteId;
    }

    startDragDot(e, dotId, noteId) {
        e.preventDefault();
        this.isDragging = true;
        this.activeDot = { dotId, noteId };
        this.lastMousePosition = { x: e.clientX, y: e.clientY };
        
        // Add active class
        document.getElementById(dotId).classList.add('active');
        document.getElementById(noteId).classList.add('active');
    }

    startDragNote(e, noteId, dotId) {
        e.preventDefault();
        this.isDragging = true;
        this.activeNote = { noteId, dotId };
        this.lastMousePosition = { x: e.clientX, y: e.clientY };
        
        // Add active class
        document.getElementById(noteId).classList.add('active');
        document.getElementById(dotId).classList.add('active');
    }

    handleMouseMove(e) {
        if (!this.isDragging) return;

        const dx = e.clientX - this.lastMousePosition.x;
        const dy = e.clientY - this.lastMousePosition.y;
        
        if (this.activeDot) {
            // Dragging a dot (vertical only) - note does NOT follow
            const dot = document.getElementById(this.activeDot.dotId);
            const currentDotTop = parseInt(dot.style.top);
            const newDotTop = Math.max(0, currentDotTop + dy);
            
            dot.style.top = `${newDotTop}px`;
            
            // Update dot position in data (note position stays the same)
            const noteIndex = this.notes.findIndex(note => note.dotId === this.activeDot.dotId);
            if (noteIndex !== -1) {
                this.notes[noteIndex].dotPosition = newDotTop;
            }
            
            // Update connection line
            this.updateConnectionLine(this.activeDot.dotId, this.activeDot.noteId);
        } else if (this.activeNote) {
            // Drag note - dot follows the note's vertical movement
            const note = document.getElementById(this.activeNote.noteId);
            const dot = document.getElementById(this.activeNote.dotId);
            const currentNoteLeft = parseInt(note.style.left);
            const currentNoteTop = parseInt(note.style.top);
            const currentDotTop = parseInt(dot.style.top);
            
            const newNoteLeft = currentNoteLeft + dx;
            const newNoteTop = currentNoteTop + dy;
            
            note.style.left = `${newNoteLeft}px`;
            note.style.top = `${newNoteTop}px`;
            
            // Calculate where dot should be based on note's bottom position
            const noteRect = note.getBoundingClientRect();
            const dividerRect = this.divider.getBoundingClientRect();
            const plotContentRect = this.plotContent.getBoundingClientRect();
            
            // Dot position should align with bottom of note
            const newDotTop = (noteRect.bottom - dividerRect.top) + this.plotContent.scrollTop;
            dot.style.top = `${Math.max(0, newDotTop)}px`;
            
            // Update note data
            const noteIndex = this.notes.findIndex(note => note.noteId === this.activeNote.noteId);
            if (noteIndex !== -1) {
                this.notes[noteIndex].position.x = newNoteLeft;
                this.notes[noteIndex].position.y = newNoteTop;
                this.notes[noteIndex].dotPosition = Math.max(0, newDotTop);
            }
            
            // Update connection line
            this.updateConnectionLine(this.activeNote.dotId, this.activeNote.noteId);
        } else if (this.activeSection) {
            // Dragging a section (vertical only)
            const section = document.getElementById(this.activeSection.sectionId);
            const currentTop = parseInt(section.style.top);
            const newTop = Math.max(0, currentTop + dy);
            
            section.style.top = `${newTop}px`;
            
            // Update section data
            const sectionIndex = this.sections.findIndex(s => s.id === this.activeSection.sectionId);
            if (sectionIndex !== -1) {
                this.sections[sectionIndex].position = newTop;
            }
        }
        
        this.lastMousePosition = { x: e.clientX, y: e.clientY };
    }

    handleMouseUp() {
        if (this.isDragging) {
            this.isDragging = false;
            
            if (this.activeDot) {
                document.getElementById(this.activeDot.dotId).classList.remove('active');
                document.getElementById(this.activeDot.noteId).classList.remove('active');
                this.activeDot = null;
            }
            
            if (this.activeNote) {
                document.getElementById(this.activeNote.noteId).classList.remove('active');
                document.getElementById(this.activeNote.dotId).classList.remove('active');
                this.activeNote = null;
            }

            if (this.activeSection) {
                this.activeSection = null;
            }
            
            // Save changes
            this.saveToLocalStorage();
        }
    }

    updateConnectionLine(dotId, noteId) {
        const dot = document.getElementById(dotId);
        const note = document.getElementById(noteId);
        const line = document.getElementById(`line-${dotId}`);
        
        if (!dot || !note || !line) return;
        
        const dotRect = dot.getBoundingClientRect();
        const noteRect = note.getBoundingClientRect();
        
        // Find the note in our data
        const noteData = this.notes.find(n => n.noteId === noteId);
        if (!noteData) return;
        
        // Calculate connection points
        const dotCenter = {
            x: dotRect.left,
            y: dotRect.bottom
        };
        
        // Line connects from bottom center of note to dot
        const noteBottom = {
            x: noteRect.left,
            y: noteRect.bottom
        };
        
        // Calculate line dimensions (horizontal distance)
        const length = Math.abs(dotCenter.x - noteBottom.x);
        const startX = Math.min(dotCenter.x, noteBottom.x);
        
        // Set line properties - horizontal line at dot's Y position
        line.style.width = `${length}px`;
        line.style.height = '2px';
        line.style.left = `${startX}px`;
        line.style.top = `${dotCenter.y}px`;
        line.style.transform = 'none';
        
        // Update text in data
        if (noteData) {
            const textarea = note.querySelector('textarea');
            if (textarea) {
                noteData.text = textarea.value;
            }
        }
    }

    handleDividerClick(e) {
        // Don't create a section if clicked on a dot or existing section label
        if (e.target.closest('.note-dot') || e.target.closest('.section-label')) return;
        
        this.tempSectionY = e.clientY;
        this.openSectionModal();
    }

    openSectionModal() {
        this.sectionLabelModal.style.display = 'block';
        this.sectionLabelInput.value = '';
        this.sectionLabelInput.focus();
    }

    closeModal() {
        this.sectionLabelModal.style.display = 'none';
        this.tempSectionY = null;
    }

    saveSection() {
        const label = this.sectionLabelInput.value.trim() || 'Section';
        this.createSection(this.tempSectionY, label);
        this.closeModal();
    }

    createSection(y, label) {
        const dividerRect = this.divider.getBoundingClientRect();
        const sectionY = y - dividerRect.top;
        
        // Create the section divider element
        const section = document.createElement('div');
        section.className = 'section-divider';
        section.style.top = `${sectionY}px`;
        
        // Create the section label
        const labelEl = document.createElement('div');
        labelEl.className = 'section-label';
        labelEl.textContent = label;
        labelEl.title = label;
        
        // Add double click handler to edit label
        labelEl.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            this.editSectionLabel(section.id, label);
        });

        // Add drag handler for section
        section.addEventListener('mousedown', (e) => {
            if (e.target === section) {
                this.startDragSection(e, sectionId);
                e.stopPropagation();
            }
        });

        // Add right-click delete
        section.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.deleteSection(sectionId);
        });
        
        // Generate unique ID
        const sectionId = `section-${Date.now()}`;
        section.id = sectionId;
        
        // Add elements to DOM
        section.appendChild(labelEl);
        this.divider.appendChild(section);
        
        // Store section data
        this.sections.push({
            id: sectionId,
            position: sectionY,
            label
        });
        
        this.saveToLocalStorage();
        
        return sectionId;
    }

    editSectionLabel(sectionId, currentLabel) {
        this.tempSectionElement = sectionId;
        this.sectionLabelInput.value = currentLabel;
        this.openSectionModal();
        
        // Override the save action temporarily
        const originalSaveAction = this.saveSectionBtn.onclick;
        this.saveSectionBtn.onclick = () => {
            const newLabel = this.sectionLabelInput.value.trim() || 'Section';
            this.updateSectionLabel(this.tempSectionElement, newLabel);
            this.closeModal();
            
            // Restore original action
            this.saveSectionBtn.onclick = originalSaveAction;
        };
    }

    updateSectionLabel(sectionId, newLabel) {
        const section = document.getElementById(sectionId);
        if (!section) return;
        
        const labelEl = section.querySelector('.section-label');
        if (labelEl) {
            labelEl.textContent = newLabel;
            labelEl.title = newLabel;
        }
        
        // Update in data
        const sectionIndex = this.sections.findIndex(s => s.id === sectionId);
        if (sectionIndex !== -1) {
            this.sections[sectionIndex].label = newLabel;
        }
        
        this.saveToLocalStorage();
    }

    saveToLocalStorage() {
        // Update text values from textareas
        this.notes.forEach(note => {
            const noteEl = document.getElementById(note.noteId);
            if (noteEl) {
                const textarea = noteEl.querySelector('textarea');
                if (textarea) {
                    note.text = textarea.value;
                }
            }
        });
        
        // Save data
        const data = {
            notes: this.notes,
            sections: this.sections
        };
        
        localStorage.setItem('chiaroscuro-data', JSON.stringify(data));
    }

    loadFromLocalStorage() {
        const savedData = localStorage.getItem('chiaroscuro-data');
        if (!savedData) return;
        
        try {
            const data = JSON.parse(savedData);
            
            // Clear existing elements
            this.clearAllElements();
            
            // Restore notes
            if (data.notes && Array.isArray(data.notes)) {
                data.notes.forEach(note => {
                    // Create note element with saved position
                    const noteId = this.createNote(
                        note.position.x, 
                        note.position.y, 
                        note.columnType
                    );
                    
                    // Get the created note
                    const noteEl = document.getElementById(noteId);
                    if (noteEl) {
                        const textarea = noteEl.querySelector('textarea');
                        if (textarea) {
                            textarea.value = note.text;
                        }
                    }
                    
                    // Update dot position
                    const newNote = this.notes[this.notes.length - 1];
                    const dot = document.getElementById(newNote.dotId);
                    if (dot) {
                        dot.style.top = `${note.dotPosition}px`;
                    }
                    
                    // Update connection line
                    this.updateConnectionLine(newNote.dotId, newNote.noteId);
                });
            }
            
            // Restore sections
            if (data.sections && Array.isArray(data.sections)) {
                data.sections.forEach(section => {
                    this.createSection(
                        section.position + this.divider.getBoundingClientRect().top, 
                        section.label
                    );
                });
            }
            
        } catch (error) {
            console.error('Error loading data from localStorage:', error);
        }
    }

    exportData() {
        // Save current state before exporting
        this.saveToLocalStorage();
        
        const data = {
            notes: this.notes,
            sections: this.sections,
            version: '1.0',
            timestamp: new Date().toISOString()
        };
        
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        // Create download link
        const a = document.createElement('a');
        a.href = url;
        a.download = `chiaroscuro-export-${new Date().toLocaleDateString().replace(/\//g, '-')}.json`;
        document.body.appendChild(a);
        a.click();
        
        // Clean up
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    importData() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';
        
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    
                    // Validate data structure
                    if (!data.notes || !data.sections) {
                        throw new Error('Invalid data format');
                    }
                    
                    // Store in localStorage and reload
                    localStorage.setItem('chiaroscuro-data', JSON.stringify(data));
                    this.loadFromLocalStorage();
                    
                } catch (error) {
                    alert('Error importing data: ' + error.message);
                }
            };
            
            reader.readAsText(file);
        };
        
        input.click();
    }

    clearAll() {
        if (confirm('Are you sure you want to clear all content? This cannot be undone.')) {
            this.clearAllElements();
            localStorage.removeItem('chiaroscuro-data');
            this.notes = [];
            this.sections = [];
        }
    }

    clearAllElements() {
        // Clear notes from both columns
        const notes = document.querySelectorAll('.note');
        notes.forEach(note => note.remove());
        
        // Clear dots from divider
        const dots = document.querySelectorAll('.note-dot');
        dots.forEach(dot => dot.remove());
        
        // Clear section dividers
        const sections = document.querySelectorAll('.section-divider');
        sections.forEach(section => section.remove());
        
        // Clear connection lines
        const lines = document.querySelectorAll('.connection-line');
        lines.forEach(line => line.remove());
    }

    deleteNote(noteId) {
        const noteIndex = this.notes.findIndex(note => note.noteId === noteId);
        if (noteIndex === -1) return;
        
        const noteData = this.notes[noteIndex];
        
        // Store for undo
        this.deletedNotes.push({
            ...noteData,
            timestamp: Date.now()
        });
        
        // Remove from DOM
        document.getElementById(noteData.noteId)?.remove();
        document.getElementById(noteData.dotId)?.remove();
        document.getElementById(noteData.lineId)?.remove();
        
        // Remove from data
        this.notes.splice(noteIndex, 1);
        
        this.saveToLocalStorage();
    }

    undoDelete() {
        if (this.deletedNotes.length === 0) return;
        
        const noteData = this.deletedNotes.pop();
        
        // Recreate the note with original data
        const noteId = this.createNote(
            noteData.position.x,
            noteData.position.y,
            noteData.columnType
        );
        
        // Restore text content
        const noteEl = document.getElementById(noteId);
        if (noteEl) {
            const textarea = noteEl.querySelector('textarea');
            if (textarea) {
                textarea.value = noteData.text;
            }
        }
        
        // Update dot position
        const newNote = this.notes[this.notes.length - 1];
        const dot = document.getElementById(newNote.dotId);
        if (dot) {
            dot.style.top = `${noteData.dotPosition}px`;
        }
        
        this.updateConnectionLine(newNote.dotId, newNote.noteId);
    }

    startDragSection(e, sectionId) {
        e.preventDefault();
        this.isDragging = true;
        this.activeSection = { sectionId };
        this.lastMousePosition = { x: e.clientX, y: e.clientY };
    }

    deleteSection(sectionId) {
        const sectionIndex = this.sections.findIndex(section => section.id === sectionId);
        if (sectionIndex === -1) return;
        
        const sectionData = this.sections[sectionIndex];
        
        // Store for undo
        this.deletedSections.push({
            ...sectionData,
            timestamp: Date.now()
        });
        
        // Remove from DOM
        document.getElementById(sectionId)?.remove();
        
        // Remove from data
        this.sections.splice(sectionIndex, 1);
        
        this.saveToLocalStorage();
    }

    setActiveNote(noteId, dotId) {
        // Remove active class from previous note
        if (this.currentActiveNote) {
            document.getElementById(this.currentActiveNote.noteId)?.classList.remove('active');
            document.getElementById(this.currentActiveNote.dotId)?.classList.remove('active');
        }
        
        // Set new active note
        this.currentActiveNote = { noteId, dotId };
        document.getElementById(noteId)?.classList.add('active');
        document.getElementById(dotId)?.classList.add('active');
    }
}

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new Chiaroscuro();
});