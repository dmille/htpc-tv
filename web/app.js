const tiles = Array.from(document.querySelectorAll('.tile'));

if (tiles.length > 0) {
  tiles[0].focus();
}

document.addEventListener('keydown', (event) => {
  const currentIndex = tiles.indexOf(document.activeElement);
  if (currentIndex === -1) return;

  const columns = window.innerWidth >= 900 ? 3 : window.innerWidth >= 600 ? 2 : 1;
  let nextIndex = currentIndex;

  switch (event.key) {
    case 'ArrowRight':
      nextIndex = Math.min(currentIndex + 1, tiles.length - 1);
      break;
    case 'ArrowLeft':
      nextIndex = Math.max(currentIndex - 1, 0);
      break;
    case 'ArrowDown':
      nextIndex = Math.min(currentIndex + columns, tiles.length - 1);
      break;
    case 'ArrowUp':
      nextIndex = Math.max(currentIndex - columns, 0);
      break;
    default:
      return;
  }

  event.preventDefault();
  tiles[nextIndex].focus();
});
