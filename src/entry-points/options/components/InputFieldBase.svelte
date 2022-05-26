<svelte:options
  immutable={true}
/>
<script lang="ts">
  export let label: string;

  const id = Math.random().toString();
</script>

<div style="margin: 0.75rem 0;">
  <label
    style="padding-bottom: 0.125rem; display: inline-block;"
    for={id}
  >{label}</label>
  <div>
    <slot {id}></slot>
  </div>
</div>
