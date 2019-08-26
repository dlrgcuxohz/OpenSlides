import { Component, HostListener, Inject, OnInit } from '@angular/core';
import { FormControl } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Router } from '@angular/router';

import { auditTime, debounceTime } from 'rxjs/operators';

import { DataStoreService } from 'app/core/core-services/data-store.service';
import { StorageService } from 'app/core/core-services/storage.service';
import { SearchModel, SearchResult, SearchService, TranslatedCollection } from 'app/core/ui-services/search.service';
import { ViewportService } from 'app/core/ui-services/viewport.service';
import { BaseViewModel } from 'app/site/base/base-view-model';
import { Searchable } from 'app/site/base/searchable';
import { ViewMediafile } from 'app/site/mediafiles/models/view-mediafile';

@Component({
    selector: 'os-super-search',
    templateUrl: './super-search.component.html',
    styleUrls: ['./super-search.component.scss']
})
export class SuperSearchComponent implements OnInit {
    /**
     * The reference to the form-control used for the `rounded-input.component`.
     */
    public searchForm = new FormControl('');

    /**
     * The user's input as query: `string`.
     */
    public searchString = '';

    /**
     * Variable to hold the verbose name of a specific collection.
     */
    public searchCollection = '';

    /**
     * Holds the collection-string of the specific collection.
     */
    private specificCollectionString: string = null;

    /**
     * The results for the given query.
     *
     * An array of `SearchResult`.
     */
    public searchResults: SearchResult[] = [];

    /**
     * Number of all found results.
     */
    public searchResultCount = 0;

    /**
     * The model, the user selected to see its preview.
     */
    public selectedModel: (BaseViewModel & Searchable) | null = null;

    /**
     * The current collection of the selected model.
     */
    public selectedCollection: string;

    /**
     * Boolean to indicate, if the preview should be shown.
     */
    public showPreview = false;

    /**
     * All registered model-collections.
     */
    public registeredModels: SearchModel[];

    /**
     * Stores all the collectionStrings registered by the `search.service`.
     */
    private collectionStrings: string[];

    /**
     * Stores all the collections with translated names.
     */
    private translatedCollectionStrings: TranslatedCollection[];

    /**
     * Key to store the query in the local-storage.
     */
    private storageKey = 'SuperSearchQuery';

    /**
     * Constructor
     *
     * @param vp The viewport-service.
     * @param overlayService Service to handle the overlaying background.
     * @param searchService Service required for searching events.
     * @param DS Reference to the `DataStore`.
     * @param router Reference to the `Router`.
     * @param store The reference to the storage-service.
     * @param dialogRef Reference for the material-dialog.
     */
    public constructor(
        public vp: ViewportService,
        private searchService: SearchService,
        private DS: DataStoreService,
        private router: Router,
        private store: StorageService,
        public dialogRef: MatDialogRef<SuperSearchComponent>,
        @Inject(MAT_DIALOG_DATA) public data: any
    ) {}

    /**
     * OnInit-function.
     *
     * Initializes the collections and the translated ones.
     */
    public ngOnInit(): void {
        this.DS.modifiedObservable.pipe(auditTime(100)).subscribe(() => this.search());

        this.registeredModels = this.searchService.getRegisteredModels();
        this.collectionStrings = this.registeredModels.map(rm => rm.collectionString);
        this.translatedCollectionStrings = this.searchService.getTranslatedCollectionStrings();

        this.searchForm.valueChanges.pipe(debounceTime(250)).subscribe(value => {
            if (value.trim() === '') {
                this.clearResults();
            } else {
                this.specificCollectionString = this.searchSpecificCollection(value.trim());
            }
            this.search();
        });

        this.restoreQueryFromStorage();
    }

    /**
     * The main function to search through all collections.
     */
    private search(): void {
        if (this.searchString !== '') {
            // Local variable to check, if the user searches for a specific id.
            let dedicatedId: number;

            const query = this.searchString;
            // Looks, if the query matches variations of 'nr.' followed by at least one digit.
            // If so, the user searches for a specific id in some collections.
            // Everything not case-sensitive.
            if (query.match(/n\w*r\.?\:?\s*\d+/gi)) {
                // If so, this expression finds the number.
                dedicatedId = +query.match(/\d+/g);
            }
            this.searchResults = this.searchService.search(
                query,
                this.specificCollectionString ? [this.specificCollectionString] : this.collectionStrings,
                'title',
                dedicatedId
            );
            this.selectFirstResult();
        } else {
            this.searchResults = [];
        }
        this.searchResultCount = this.searchResults
            .map(result => result.models.length)
            .reduce((acc, current) => acc + current, 0);
    }

    /**
     * This function test, if the query matches some of the `collectionStrings`.
     *
     * That indicates, that the user looks for items in a specific collection.
     *
     * @returns { { collection: string, query: string[] } | null } Either an object containing the found collection and the query
     * or null, if there exists none.
     */
    private searchSpecificCollection(query: string): string | null {
        // The query is splitted by the first whitespace or the first ':'.
        const splittedQuery = query.split(/\s*(?::|\s+)\s*/);
        const nextCollection = this.translatedCollectionStrings.find(item =>
            // The value of the item should match the query plus any further
            // characters (useful for splitted words in the query).
            // This will look, if the user searches in a specific collection.
            // Flag 'i' tells, that cases are ignored.
            new RegExp(item.value, 'i').test(splittedQuery[0])
        );
        if (!!nextCollection) {
            this.searchString = splittedQuery.slice(1).join(' ');
            this.searchCollection = splittedQuery[0];
            return nextCollection.collection;
        } else {
            this.searchString = query;
            this.searchCollection = '';
            return null;
        }
    }

    /**
     * Function to search through the result-list and select the first valid result to display.
     *
     * Otherwise the model is set to 'null'.
     */
    private selectFirstResult(): void {
        for (const result of this.searchResults) {
            if (result.models.length > 0) {
                this.changeModel(result.models[0]);
                return;
            }
        }
        // If this code is reached, there are no results for the query!
        this.selectedModel = null;
    }

    /**
     * Function to go through the whole list of results.
     *
     * @param up If the user presses the `ArrowUp`.
     */
    private selectNextResult(up: boolean): void {
        const tmp = this.searchResults.flatMap((result: SearchResult) => result.models);
        this.changeModel(tmp[(tmp.indexOf(this.selectedModel) + (up ? -1 : 1)).modulo(tmp.length)]);
    }

    /**
     * Function to set a specific collection and search through it.
     *
     * @param collectionName The `verboseName` of the selected collection.
     */
    public setCollection(collectionName: string): void {
        this.searchCollection = this.searchCollection === collectionName ? '' : collectionName;
        if (this.searchCollection !== '') {
            this.searchForm.setValue(this.searchCollection + ': ' + this.searchString);
        } else {
            this.searchForm.setValue(this.searchString);
        }
    }

    /**
     * Function to change the selected model.
     *
     * Ensures, that the preview-window's size is reset to the default one.
     *
     * @param model The model, the user selected. Typeof `BaseViewModel & Searchable`.
     */
    public changeModel(model: BaseViewModel & Searchable): void {
        this.selectedModel = model;
        this.selectedCollection = model.collectionString;
    }

    /**
     * Function to go to the detailed view of the model.
     *
     * @param model The model, the user selected.
     */
    public viewResult(model: BaseViewModel & Searchable): void {
        if (model.collectionString === 'mediafiles/mediafile' && !(<ViewMediafile>model).is_directory) {
            window.open(model.getDetailStateURL(), '_blank');
        } else {
            this.router.navigateByUrl(model.getDetailStateURL());
        }
        this.hideOverlay();
        this.saveQueryToStorage(this.searchForm.value);
    }

    /**
     * Hides the overlay, so the search will disappear.
     */
    public hideOverlay(): void {
        this.clearResults();
        this.dialogRef.close();
    }

    /**
     * Clears the whole search with results and preview.
     */
    private clearResults(): void {
        this.searchResults = [];
        this.selectedModel = null;
        this.searchCollection = '';
        this.searchString = '';
        this.saveQueryToStorage(null);
    }

    /**
     * Function to save an entered query.
     *
     * @param query The query to store.
     */
    private saveQueryToStorage(query: string | null): void {
        this.store.set(this.storageKey, query);
    }

    /**
     * Function to restore a previous entered query.
     * Once loaded, the result is passed as value to the form-control.
     */
    private restoreQueryFromStorage(): void {
        this.store.get<string>(this.storageKey).then(value => {
            if (value) {
                this.searchForm.setValue(value);
            }
        }, null);
    }

    /**
     * Function to open the global `super-search.component`.
     *
     * @param event KeyboardEvent to listen to keyboard-inputs.
     */
    @HostListener('document:keydown', ['$event']) public onKeyNavigation(event: KeyboardEvent): void {
        if (event.key === 'Enter') {
            this.viewResult(this.selectedModel);
        }
        if (event.key === 'ArrowUp') {
            this.selectNextResult(true);
        }
        if (event.key === 'ArrowDown') {
            this.selectNextResult(false);
        }
        if (event.altKey && event.shiftKey && event.key === 'V') {
            this.showPreview = !this.showPreview;
        }
    }
}
