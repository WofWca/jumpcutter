<script lang="ts">
  export let label: string;
  export let checked: boolean;
</script>

<!-- Wrapper div so consecutive checkboxes are displayed on top of each other. -->
<div style="margin: 0.75rem 0;">
  <label>
    <input
      type="checkbox"
      {...$$restProps}
      bind:checked
    > {label}
  </label>
</div>

<style>
  input {
    /* So emojis aren't so close to the checkbox so they don't look too confusing together */
    margin-right: 0.4rem;
  }
</style>
