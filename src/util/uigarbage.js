

export function makeslider(label, callback, min=0, max=10, value=0, step=1) {
  const container = document.createElement('div');
  const labelElem = document.createElement('label');
  labelElem.textContent = label;

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = min;
  slider.max = max;
  slider.step = step;
  slider.value = value;

  const valueElem = document.createElement('span');
  valueElem.textContent = value;

  slider.addEventListener('input', () => {
    valueElem.textContent = slider.value.substring(0,7);
    callback(parseFloat(slider.value));
  });

  container.appendChild(labelElem);
  container.appendChild(slider);
  container.appendChild(valueElem);

  return container;
}