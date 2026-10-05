import { LightningElement, api } from 'lwc';

/**
 * Generic, reusable searchable combobox.
 *
 * Public API
 * ----------
 *  items       {Array}   List of objects to show in the dropdown.      (required)
 *  sortField   {String}  Field (dot-notation supported) to sort by.    (optional)
 *  sortOrder   {String}  'asc' | 'desc' (case-insensitive).            (default 'asc')
 *  labelField  {String}  Field used as the visible text / search text. (default 'label')
 *  valueField  {String}  Field used as the unique value.               (default 'value')
 *  label       {String}  Field label shown above the input.
 *  placeholder {String}  Input placeholder text.
 *  required    {Boolean} Shows a required asterisk next to the label.
 *  disabled    {Boolean} Disables the input.
 *
 * Public event
 * ------------
 *  itemselect  CustomEvent whose detail is:
 *              { selectedItem: <the original object from "items">, or null on clear }
 *
 * Public method
 * -------------
 *  clearSelection()  Imperatively clears the current selection/search text.
 */
export default class SearchableCombobox extends LightningElement {
    // ---- Simple public props -------------------------------------------------
    @api label;
    @api placeholder = 'Search...';
    @api required = false;
    @api disabled = false;
    @api labelField = 'label';
    @api valueField = 'value';

    // ---- Reactive state --------------------------------------------------------
    searchTerm = '';
    isDropdownOpen = false;
    highlightedIndex = -1;
    selectedItem = null;
    processedItems = [];

    _items = [];
    _sortField;
    _sortOrder = 'asc';
    _blurTimeoutId;

    // ---- items / sortField / sortOrder re-sort whenever any of them changes ---
    @api
    get items() {
        return this._items;
    }
    set items(value) {
        this._items = Array.isArray(value) ? value : [];
        this.processedItems = this.sortItems(this._items);
    }

    @api
    get sortField() {
        return this._sortField;
    }
    set sortField(value) {
        this._sortField = value;
        this.processedItems = this.sortItems(this._items);
    }

    @api
    get sortOrder() {
        return this._sortOrder;
    }
    set sortOrder(value) {
        this._sortOrder = value;
        this.processedItems = this.sortItems(this._items);
    }

    // ---- Public imperative API --------------------------------------------------
    @api
    clearSelection() {
        this.handleClear();
    }

    // ---- Lifecycle ---------------------------------------------------------------
    disconnectedCallback() {
        if (this._blurTimeoutId) {
            clearTimeout(this._blurTimeoutId);
        }
    }

    // ---- Derived data --------------------------------------------------------------
    get filteredItems() {
        const term = (this.searchTerm || '').trim().toLowerCase();
        let list = this.processedItems || [];

        if (term && !this.selectedItem) {
            list = list.filter((item) => {
                const label = this.getFieldValue(item, this.labelField);
                return label != null && String(label).toLowerCase().includes(term);
            });
        }

        return list.map((item, index) => {
            const label = this.getFieldValue(item, this.labelField);
            const value = this.getFieldValue(item, this.valueField) ?? label ?? index;
            const isHighlighted = index === this.highlightedIndex;
            return {
                key: `${value}-${index}`,
                label,
                value,
                source: item,
                cssClass:
                    'slds-listbox__option slds-listbox__option_plain slds-media slds-media_small slds-media_center' +
                    (isHighlighted ? ' slds-has-focus' : '')
            };
        });
    }

    get showNoResults() {
        return this.isDropdownOpen && this.filteredItems.length === 0;
    }

    get showClearButton() {
        return !!this.searchTerm;
    }

    get comboboxWrapperClass() {
        return (
            'slds-combobox slds-dropdown-trigger slds-dropdown-trigger_click' +
            (this.isDropdownOpen ? ' slds-is-open' : '')
        );
    }

    get comboboxExpanded() {
        return this.isDropdownOpen ? 'true' : 'false';
    }

    // ---- Event handlers --------------------------------------------------------
    handleFocus() {
        clearTimeout(this._blurTimeoutId);
        this.openDropdown();
    }

    handleBlur() {
        // Delay so a click on an option (which also blurs the input) has a chance
        // to register before the dropdown disappears.
        this._blurTimeoutId = setTimeout(() => {
            this.closeDropdown();
        }, 150);
    }

    handleInput(event) {
        this.searchTerm = event.target.value;
        this.selectedItem = null;
        this.highlightedIndex = -1;
        this.openDropdown();
    }

    handleKeyDown(event) {
        if (!this.isDropdownOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            this.openDropdown();
            return;
        }

        const items = this.filteredItems;

        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                this.highlightedIndex = items.length ? (this.highlightedIndex + 1) % items.length : -1;
                break;
            case 'ArrowUp':
                event.preventDefault();
                this.highlightedIndex = items.length
                    ? (this.highlightedIndex - 1 + items.length) % items.length
                    : -1;
                break;
            case 'Enter':
                event.preventDefault();
                if (this.highlightedIndex >= 0 && items[this.highlightedIndex]) {
                    this.selectItem(items[this.highlightedIndex]);
                }
                break;
            case 'Escape':
                event.preventDefault();
                this.closeDropdown();
                break;
            case 'Tab':
                this.closeDropdown();
                break;
            default:
                break;
        }
    }

    handleListboxMouseDown(event) {
        // Prevents the input's blur handler from closing the dropdown
        // before the click on the option is processed.
        event.preventDefault();
    }

    handleOptionClick(event) {
        const index = Number(event.currentTarget.dataset.index);
        const option = this.filteredItems[index];
        if (option) {
            this.selectItem(option);
        }
    }

    handleClear() {
        this.selectedItem = null;
        this.searchTerm = '';
        this.highlightedIndex = -1;
        this.closeDropdown();
        this.dispatchSelection(null);
        this.refs.input?.focus();
    }

    // ---- Internal helpers --------------------------------------------------------
    selectItem(option) {
        this.selectedItem = option;
        this.searchTerm = option.label;
        this.closeDropdown();
        this.dispatchSelection(option.source);
    }

    dispatchSelection(record) {
        this.dispatchEvent(
            new CustomEvent('itemselect', {
                detail: { selectedItem: record }
            })
        );
    }

    openDropdown() {
        this.isDropdownOpen = true;
    }

    closeDropdown() {
        this.isDropdownOpen = false;
        this.highlightedIndex = -1;
    }

    sortItems(items) {
        if (!this._sortField || !Array.isArray(items)) {
            return [...(items || [])];
        }

        const field = this._sortField;
        const direction = (this._sortOrder || 'asc').toLowerCase().startsWith('desc') ? -1 : 1;

        return [...items].sort((a, b) => {
            const valA = this.getFieldValue(a, field);
            const valB = this.getFieldValue(b, field);

            if (valA == null && valB == null) return 0;
            if (valA == null) return -1 * direction;
            if (valB == null) return 1 * direction;

            if (typeof valA === 'number' && typeof valB === 'number') {
                return (valA - valB) * direction;
            }

            return (
                String(valA).localeCompare(String(valB), undefined, {
                    numeric: true,
                    sensitivity: 'base'
                }) * direction
            );
        });
    }

    getFieldValue(obj, path) {
        if (!obj || !path) return undefined;
        return path.split('.').reduce((acc, key) => (acc != null ? acc[key] : undefined), obj);
    }
}
