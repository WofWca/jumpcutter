<!--
Copyright (C) 2020, 2021, 2022  WofWca <wofwca@protonmail.com>
Copyright (C) 2023  jakubiakdev

This file is part of Jump Cutter Browser Extension.

Jump Cutter Browser Extension is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

Jump Cutter Browser Extension is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with Jump Cutter Browser Extension.  If not, see <https://www.gnu.org/licenses/>.
-->

<svelte:options
  immutable={true}
/>
<script lang="ts">
  export let label: string;

  const id = Math.random().toString();
</script>

<div class="container">
  <label
    for={id}
  >{label}</label>
  <div class="slot-container">
    <slot {id}></slot>
  </div>
</div>

<style>
  .container {
    margin: 0.75rem 0;
    padding: 0.5rem;
    display: grid;
    grid-template-columns: auto auto;
  }
  .container:not(:last-child) {
    border-bottom: 1px gray solid;
  }

  label {
    padding-bottom: 0.125rem;
    display: inline-block;
  }

  .slot-container {
    justify-self: right;
  }
</style>
