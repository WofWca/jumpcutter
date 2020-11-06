<script lang="ts">
  import InputFieldBase from './InputFieldBase.svelte'

  export let label: string;
  export let value: number;
  export let step: HTMLInputElement['step'] = 'any';
</script>

<InputFieldBase {label} let:id>
  <input
    {...$$props}
    type="number"
    bind:value
    {step}
    {id}
  />
</InputFieldBase>
