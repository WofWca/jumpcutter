// JS because I thought maybe it's because of TypeScript somehow messing with stuff.

const p = import('./someModule');
console.log('Importing ', p);
p.then(m => {
  console.log('Imported: ', m);
  m.default();
});