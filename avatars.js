((root) => {
  "use strict";

  const species = [
    { name: "Gato", color: "#deaa80", ears: '<path d="M25 42 21 17 42 29M75 42 79 17 58 29" fill="COLOR" stroke="#293b38" stroke-width="3"/>' },
    { name: "Raposa", color: "#ec945e", ears: '<path d="M23 45 18 12 43 29M77 45 82 12 57 29" fill="COLOR" stroke="#293b38" stroke-width="3"/>' },
    { name: "Urso", color: "#b98966", ears: '<circle cx="27" cy="30" r="13" fill="COLOR" stroke="#293b38" stroke-width="3"/><circle cx="73" cy="30" r="13" fill="COLOR" stroke="#293b38" stroke-width="3"/>' },
    { name: "Coelho", color: "#d3b6d5", ears: '<ellipse cx="34" cy="22" rx="8" ry="22" fill="COLOR" stroke="#293b38" stroke-width="3"/><ellipse cx="66" cy="22" rx="8" ry="22" fill="COLOR" stroke="#293b38" stroke-width="3"/>' },
    { name: "Cachorro", color: "#d5ad72", ears: '<ellipse cx="23" cy="48" rx="11" ry="21" fill="COLOR" stroke="#293b38" stroke-width="3"/><ellipse cx="77" cy="48" rx="11" ry="21" fill="COLOR" stroke="#293b38" stroke-width="3"/>' },
    { name: "Guaxinim", color: "#9bacaa", ears: '<path d="M25 42 23 19 43 30M75 42 77 19 57 30" fill="COLOR" stroke="#293b38" stroke-width="3"/>' },
    { name: "Leão", color: "#e5b35e", ears: '<circle cx="50" cy="55" r="41" fill="#b8794f" stroke="#293b38" stroke-width="3"/>' },
    { name: "Panda", color: "#e6e5d8", ears: '<circle cx="27" cy="29" r="12" fill="#354a48" stroke="#293b38" stroke-width="3"/><circle cx="73" cy="29" r="12" fill="#354a48" stroke="#293b38" stroke-width="3"/>' },
    { name: "Coala", color: "#a9bec1", ears: '<circle cx="20" cy="40" r="16" fill="COLOR" stroke="#293b38" stroke-width="3"/><circle cx="80" cy="40" r="16" fill="COLOR" stroke="#293b38" stroke-width="3"/>' },
    { name: "Coruja", color: "#a991c6", ears: '<path d="M23 43 25 21 40 31M77 43 75 21 60 31" fill="COLOR" stroke="#293b38" stroke-width="3"/>' }
  ];
  const styles = [
    { name: "aventureiro", background: "#325e52", accessory: '<path d="M32 30q18-17 36 0" fill="#d2a96f" stroke="#293b38" stroke-width="3"/><path d="M28 31h44" stroke="#293b38" stroke-width="4" stroke-linecap="round"/>' },
    { name: "astronauta", background: "#395470", accessory: '<circle cx="50" cy="54" r="39" fill="none" stroke="#d7eff2" stroke-width="4"/><path d="M25 83h50" stroke="#d7eff2" stroke-width="6" stroke-linecap="round"/>' },
    { name: "mago", background: "#625278", accessory: '<path d="M28 31 48 4 63 29 73 32Z" fill="#8f83cb" stroke="#293b38" stroke-width="3"/><circle cx="49" cy="20" r="3" fill="#f3d87a"/>' },
    { name: "realeza", background: "#765b55", accessory: '<path d="M31 30 27 16 40 23 50 12 60 23 73 16 69 30Z" fill="#f2cb68" stroke="#293b38" stroke-width="3"/>' },
    { name: "músico", background: "#476276", accessory: '<path d="M15 52a35 35 0 0 1 70 0" fill="none" stroke="#f1c96e" stroke-width="6"/><rect x="11" y="46" width="10" height="19" rx="4" fill="#f1c96e"/><rect x="79" y="46" width="10" height="19" rx="4" fill="#f1c96e"/>' }
  ];

  function isValid(id) {
    return Number.isInteger(id) && id >= 1 && id <= species.length * styles.length;
  }

  function name(id) {
    if (!isValid(id)) return "";
    return `${species[Math.floor((id - 1) / styles.length)].name} ${styles[(id - 1) % styles.length].name}`;
  }

  function markup(id) {
    if (!isValid(id)) return "";
    const animal = species[Math.floor((id - 1) / styles.length)];
    const style = styles[(id - 1) % styles.length];
    const mask = animal.name === "Panda" || animal.name === "Guaxinim"
      ? '<ellipse cx="36" cy="52" rx="12" ry="10" fill="#536663"/><ellipse cx="64" cy="52" rx="12" ry="10" fill="#536663"/>'
      : "";
    const beak = animal.name === "Coruja"
      ? '<path d="m45 62 5 7 5-7Z" fill="#e9b55b"/>'
      : '<ellipse cx="50" cy="63" rx="5" ry="3" fill="#293b38"/><path d="M46 69q4 4 8 0" fill="none" stroke="#293b38" stroke-width="2" stroke-linecap="round"/>';
    return `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false"><circle cx="50" cy="50" r="50" fill="${style.background}"/>${animal.ears.replaceAll("COLOR", animal.color)}<ellipse cx="50" cy="57" rx="32" ry="29" fill="${animal.color}" stroke="#293b38" stroke-width="3"/>${mask}<circle cx="38" cy="53" r="4" fill="#293b38"/><circle cx="62" cy="53" r="4" fill="#293b38"/><circle cx="39" cy="52" r="1" fill="#fff"/><circle cx="63" cy="52" r="1" fill="#fff"/>${beak}${style.accessory}</svg>`;
  }

  function render(element, id) {
    element.innerHTML = markup(id);
  }

  root.BlefeAvatars = Object.freeze({ count: species.length * styles.length, isValid, name, markup, render });
})(globalThis);
