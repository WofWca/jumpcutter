<svelte:options
  immutable={true}
/>
<script lang="ts">
  export let value: string;

  function onChange(e: Event) {
    // So the value doesn't change when the user types, we only want to change it by changing the `value` prop.
    // This is the only reason why we need this component.
    // "Why not just add a `readonly` attrubite?", you might ask. Because it would make it skip form validation.
    (e.target! as HTMLInputElement).value = value;
  }
</script>

<!-- on:input={e => e.target.value = value} -->
<input
  {...$$props}
  on:input={onChange}

  on:input
  on:keydown
/>
