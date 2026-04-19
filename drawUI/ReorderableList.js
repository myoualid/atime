import {   
    UIText,
   UIPanel,
   UICheckbox,
   ListboxItem,
   UIListbox
 } from "./ui.js";

class ReorderableList {
    constructor(items = [], onReorder = null) {
        this.items = [...items];

        this.onReorder = onReorder;

        this.container = new UIListbox();

        this.container.addClass('reorderable-list');

        this.draggedItem = null;

        this.placeholder = null;
        
        this.render();

        this.setupDragAndDrop();
    }

    render() {
        this.container.clear();

        this.items.forEach((item, index) => {
            const listItem = new ListboxItem(item.label || item);

            listItem.dom.draggable = true;

            listItem.dom.dataset.index = index;
            
            // Add drag handle
            const handle = document.createElement('span');

            handle.className = 'drag-handle' ;
            
            listItem.dom.insertBefore(handle, listItem.dom.firstChild);
            
            // Add content
            if (item.checked !== undefined) {
                const checkbox = new UICheckbox(item.checked);

                checkbox.onChange(() => {
                    item.checked = checkbox.getValue();

                    if (item.onChange) item.onChange(item.checked);
                });

                listItem.add(checkbox);
            }
            
            const label = new UIText(item.label || item);

            listItem.add(label);
            
            this.container.add(listItem);
        });
    }

    setupDragAndDrop() {
        this.container.dom.addEventListener('dragstart', (e) => {
            this.draggedItem = e.target.closest('.reorderable-item');

            if (this.draggedItem) {
                e.dataTransfer.effectAllowed = 'move';

                this.draggedItem.style.opacity = '0.5';
                
                // Create placeholder
                this.placeholder = document.createElement('div');

                this.placeholder.className = 'reorderable-placeholder';

                this.placeholder.style.height = this.draggedItem.offsetHeight + 'px';

                this.placeholder.style.background = 'var(--brand-color-bg-secondary)';

                this.placeholder.style.border = '1px dashed var(--brand-color-border)';

                this.placeholder.style.margin = '2px 0';
            }
        });

        this.container.dom.addEventListener('dragend', (e) => {
            if (this.draggedItem) {
                this.draggedItem.style.opacity = '';

                this.draggedItem = null;
            }

            if (this.placeholder && this.placeholder.parentNode) {
                this.placeholder.parentNode.removeChild(this.placeholder);
            }

            this.placeholder = null;
        });

        this.container.dom.addEventListener('dragover', (e) => {
            e.preventDefault();

            e.dataTransfer.dropEffect = 'move';
            
            const target = e.target.closest('.reorderable-item');

            if (target && target !== this.draggedItem) {
                const rect = target.getBoundingClientRect();

                const midpoint = rect.top + rect.height / 2;
                
                if (this.placeholder && this.placeholder.parentNode) {
                    this.placeholder.parentNode.removeChild(this.placeholder);
                }
                
                if (e.clientY < midpoint) {
                    target.parentNode.insertBefore(this.placeholder, target);
                } else {
                    target.parentNode.insertBefore(this.placeholder, target.nextSibling);
                }
            }
        });

        this.container.dom.addEventListener('drop', (e) => {
            e.preventDefault();
            
            if (this.draggedItem && this.placeholder) {
                const fromIndex = parseInt(this.draggedItem.dataset.index);

                const toIndex = Array.from(this.container.dom.children).indexOf(this.placeholder);
                
                if (fromIndex !== toIndex) {
                    // Reorder items array
                    const [movedItem] = this.items.splice(fromIndex, 1);

                    this.items.splice(toIndex, 0, movedItem);
                    
                    // Update indices
                    this.items.forEach((item, idx) => {
                        if (this.container.dom.children[idx]) {
                            this.container.dom.children[idx].dataset.index = idx;
                        }
                    });
                    
                    // Re-render
                    this.render();
                    
                    // Call reorder callback
                    if (this.onReorder) {
                        this.onReorder(this.items);
                    }
                }
            }
        });
    }

    updateItems(newItems) {
        this.items = [...newItems];

        this.render();
    }

    getItems() {
        return [...this.items];
    }
}


export { ReorderableList };

