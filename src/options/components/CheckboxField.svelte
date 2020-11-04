<script lang="ts">
  export let label: string;
  export let checked: boolean;
</script>

<!-- Wrapper div so consecutive checkboxes are displayed on top of each other. -->
<div style="margin: 0.75rem 0;">
  <label>
    <input
      type="checkbox"
      {...$$props}
      bind:checked
    > {label}
  </label>
</div>
