<script lang="ts">
  export let value: number;
  export let label: string;
  export let fractionalDigits: number = 3;
  // export let max;
  // export let min;
  // export let step;

  $: if (typeof value !== 'number') {
    if (process.env.NODE_ENV !== 'production') {
      console.error(`Expected \`value\` prop to be a number, got ${value}`);
    }
  }
</script>

<label>
  <span>{label}</span>
  <div class="range-and-value">
    <input
      type="range"
      {...$$restProps}
      bind:value
    >
    <span
      aria-hidden="true"
      class="number-representation"
    >{value.toFixed(fractionalDigits)}</span>
  </div>
</label>

<style>
  label {
    display: block;
    margin-top: 1rem;
  }
  .range-and-value {
    display: flex;
    align-items: center;
  }
  input {
    flex-grow: 1;
  }
  .number-representation {
    /* So they don't chane width when thir value changes. */
    min-width: var(--number-representation-min-width);
    text-align: end;
  }
</style>
