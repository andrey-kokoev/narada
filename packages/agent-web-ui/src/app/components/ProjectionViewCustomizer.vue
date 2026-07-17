<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@narada2/ui-vue';
import { describeFacets, type ProjectionViewDraft, type ProjectionViewFacetOption, type ProjectionViewOption } from '../lib/projectionViews';
import type { CustomProjectionView } from '../composables/useProjectionVerbosity';

const props = defineProps<{
  activeViewId: string;
  viewOptions: readonly ProjectionViewOption[];
  customViews: readonly CustomProjectionView[];
  facetOptions: readonly ProjectionViewFacetOption[];
}>();

const emit = defineEmits<{
  select: [id: string];
  save: [view: ProjectionViewDraft];
  delete: [id: string];
}>();

const open = ref(false);
const editingId = ref<string | undefined>();
const draftLabel = ref('');
const draftFacets = ref<ProjectionViewFacetOption['id'][]>([]);
const validationMessage = ref('');

const activeView = computed(() => props.viewOptions.find((view) => view.id === props.activeViewId) ?? props.viewOptions[0] ?? null);
const editingCustomView = computed(() => Boolean(editingId.value && props.customViews.some((view) => view.id === editingId.value)));

watch(open, (isOpen) => {
  if (isOpen) loadFromView(props.activeViewId);
});

function loadFromView(id: string) {
  const view = props.viewOptions.find((option) => option.id === id) ?? activeView.value;
  if (!view) return;
  validationMessage.value = '';
  if (view.builtIn) {
    editingId.value = undefined;
    draftLabel.value = `${view.label} custom`;
    draftFacets.value = [...view.facets];
    return;
  }
  editingId.value = view.id;
  draftLabel.value = view.label;
  draftFacets.value = [...view.facets];
}

function selectView(id: string) {
  emit('select', id);
  loadFromView(id);
}

function editView(id: string) {
  loadFromView(id);
}

function startNewView() {
  editingId.value = undefined;
  draftLabel.value = 'My view';
  draftFacets.value = ['conversation'];
  validationMessage.value = '';
}

function saveView() {
  const label = draftLabel.value.trim();
  const facets = [...new Set(draftFacets.value)];
  if (!label) {
    validationMessage.value = 'Enter a name for this view.';
    return;
  }
  if (!facets.length) {
    validationMessage.value = 'Select at least one category.';
    return;
  }
  emit('save', {
    id: editingId.value,
    label,
    description: describeFacets(facets),
    facets,
  });
  open.value = false;
}

function deleteView() {
  if (!editingId.value) return;
  emit('delete', editingId.value);
  startNewView();
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogTrigger as-child>
      <button
        type="button"
        class="view-customize-trigger"
        aria-label="Customize views"
        title="Customize views"
      >
        <span class="view-customize-corner" aria-hidden="true"></span>
      </button>
    </DialogTrigger>

    <DialogContent class="projection-view-dialog-content">
      <DialogHeader>
        <DialogTitle>Customize views</DialogTitle>
        <DialogDescription>
          Choose which projected event categories appear in a view, or create a browser-local custom view.
        </DialogDescription>
      </DialogHeader>

      <div class="projection-view-dialog-body">
        <section class="projection-view-library" aria-labelledby="projection-view-library-title">
          <div class="projection-view-section-heading">
            <h3 id="projection-view-library-title">Available views</h3>
            <span class="projection-view-active-note">Active: {{ activeView?.label ?? 'Chat' }}</span>
          </div>

          <div class="projection-view-options" role="list">
            <div
              v-for="option in viewOptions"
              :key="option.id"
              class="projection-view-option"
              :class="{ 'projection-view-option-active': option.id === activeViewId }"
            >
              <button
                type="button"
                class="projection-view-option-select"
                :aria-pressed="option.id === activeViewId"
                @click="selectView(option.id)"
              >
                <span class="projection-view-option-label">{{ option.label }}</span>
                <span class="projection-view-option-description">{{ option.description }}</span>
                <span v-if="option.id === activeViewId" class="projection-view-option-state">Active</span>
              </button>
              <button
                v-if="!option.builtIn"
                type="button"
                class="projection-view-option-edit"
                :aria-label="`Edit ${option.label}`"
                @click="editView(option.id)"
              >
                Edit
              </button>
            </div>
          </div>

          <button type="button" class="projection-view-new-button" @click="startNewView">Create custom view</button>
        </section>

        <form class="projection-view-editor" @submit.prevent="saveView">
          <div class="projection-view-section-heading">
            <h3>{{ editingCustomView ? 'Edit custom view' : 'New custom view' }}</h3>
            <span v-if="editingCustomView" class="projection-view-active-note">Saved locally</span>
          </div>

          <label class="projection-view-field-label" for="projection-view-name">Name</label>
          <input
            id="projection-view-name"
            v-model="draftLabel"
            class="projection-view-name-input"
            maxlength="48"
            autocomplete="off"
            placeholder="e.g. Debug conversation"
          />

          <fieldset class="projection-view-facets">
            <legend>Include in this view</legend>
            <label v-for="facet in facetOptions" :key="facet.id" class="projection-view-facet">
              <input v-model="draftFacets" type="checkbox" :value="facet.id" />
              <span>
                <strong>{{ facet.label }}</strong>
                <small>{{ facet.description }}</small>
              </span>
            </label>
          </fieldset>

          <p v-if="validationMessage" class="projection-view-validation" role="alert">{{ validationMessage }}</p>

          <DialogFooter>
            <button v-if="editingCustomView" type="button" class="projection-view-delete-button" @click="deleteView">Delete</button>
            <button type="button" class="projection-view-cancel-button" @click="open = false">Cancel</button>
            <button type="submit" class="projection-view-save-button">Save view</button>
          </DialogFooter>
        </form>
      </div>
    </DialogContent>
  </Dialog>
</template>
