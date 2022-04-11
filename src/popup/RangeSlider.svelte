<script lang="ts">
  export let value: number;
  export let label: string;
  export let fractionalDigits: number = 3;

  type SvelteActionParameters = any;
  type SvelteAction = (node: HTMLElement, parameters: SvelteActionParameters) => {
    update?: (parameters: SvelteActionParameters) => void,
    destroy?: () => void,
  };

  export let useForInput: SvelteAction = () => ({});
  export let useForInputParams: SvelteActionParameters = undefined;

  // export let max;
  // export let min;
  // export let step;
</script>

<!-- Disabling the warning because it's false – apparently, it can't detect an input if it's not a direct child.
TODO. -->
<!-- svelte-ignore a11y-label-has-associated-control -->
<label>
  <span>{label}</span>
  <div class="range-and-value">
    <input
      type="range"
      {...$$restProps}
      bind:value
      use:useForInput={useForInputParams}
      on:input
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
