<script lang="ts">
  /*
    层栈的唯一分发点。每个分支只负责「把 payload 交给对应组件」，
    外壳（mask / modal / panel-grip）由 OverlayHost 统一提供。
  */
  import type { Layer } from '$lib/store/overlay.svelte';
  import { closeTemplatePicker } from '$lib/store/overlay.svelte';
  import TaskDetail from '$lib/views/editors/TaskDetail.svelte';
  import TaskEditor from '$lib/views/editors/TaskEditor.svelte';
  import QuickAdd from '$lib/views/editors/QuickAdd.svelte';
  import SearchModal from '$lib/views/editors/SearchModal.svelte';
  import FilterPanel from '$lib/views/editors/FilterPanel.svelte';
  import ReminderCenter from '$lib/views/editors/ReminderCenter.svelte';
  import SettingsModal from '$lib/views/editors/SettingsModal.svelte';
  import BackupModal from '$lib/views/editors/BackupModal.svelte';
  import HelpModal from '$lib/views/editors/HelpModal.svelte';
  import ShortcutsModal from '$lib/views/editors/ShortcutsModal.svelte';
  import HabitEditor from '$lib/views/editors/HabitEditor.svelte';
  import CountdownEditor from '$lib/views/editors/CountdownEditor.svelte';
  import TemplatePicker from '$lib/views/editors/TemplatePicker.svelte';
  import Confirm from '$lib/ui/Confirm.svelte';
  import Prompt from '$lib/ui/Prompt.svelte';
  import TypedConfirm from '$lib/ui/TypedConfirm.svelte';

  let { layer }: { layer: Layer } = $props();
</script>

{#if layer.kind === 'detail'}
  <TaskDetail {layer} />
{:else if layer.kind === 'editor'}
  <TaskEditor {layer} />
{:else if layer.kind === 'templatePicker'}
  <TemplatePicker
    onpick={(t) => {
      (layer as Extract<Layer, { kind: 'templatePicker' }>).onpick(t);
      closeTemplatePicker();
    }}
    onclose={closeTemplatePicker}
  />
{:else if layer.kind === 'confirm'}
  {@const l = layer as Extract<Layer, { kind: 'confirm' }>}
  <Confirm req={l.req} />
{:else if layer.kind === 'prompt'}
  {@const l = layer as Extract<Layer, { kind: 'prompt' }>}
  <Prompt req={l.req} />
{:else if layer.kind === 'typed'}
  {@const l = layer as Extract<Layer, { kind: 'typed' }>}
  <TypedConfirm req={l.req} />
{:else if layer.kind === 'quickAdd'}
  <QuickAdd />
{:else if layer.kind === 'search'}
  <SearchModal />
{:else if layer.kind === 'filter'}
  <FilterPanel />
{:else if layer.kind === 'reminder'}
  <ReminderCenter />
{:else if layer.kind === 'settings'}
  <SettingsModal />
{:else if layer.kind === 'backup'}
  <BackupModal />
{:else if layer.kind === 'help'}
  <HelpModal />
{:else if layer.kind === 'shortcuts'}
  <ShortcutsModal />
{:else if layer.kind === 'habitEditor'}
  <HabitEditor />
{:else if layer.kind === 'cdEditor'}
  <CountdownEditor />
{/if}
