(() => {
  "use strict";

  const types = ["leao", "coelho", "vaca", "peixe", "tigre", "macaco", "elefante", "tartaruga", "troca", "coringa"];
  const limit = 1_000_000_000;

  function createModel() {
    const counts = () => Object.fromEntries(types.map((type) => [type, 0]));
    const rewards = () => Object.fromEntries(types.map((type) => [type, { count: 0, total: 0 }]));
    return { version: 2, observations: 0, humanPlays: counts(), humanGuesses: counts(), aiRewards: { play: rewards(), guess: rewards() } };
  }

  function sanitizeModel(candidate) {
    const model = createModel();
    if (!candidate || ![1, 2].includes(candidate.version) || !Number.isSafeInteger(candidate.observations) || candidate.observations < 0) return model;
    model.observations = Math.min(candidate.observations, limit);
    for (const group of ["humanPlays", "humanGuesses"]) {
      for (const type of types) {
        const value = candidate[group]?.[type];
        if (Number.isSafeInteger(value) && value >= 0) model[group][type] = Math.min(value, limit);
      }
    }
    if (candidate.version === 2) {
      for (const action of ["play", "guess"]) {
        for (const type of types) {
          const entry = candidate.aiRewards?.[action]?.[type];
          if (Number.isSafeInteger(entry?.count) && entry.count >= 0 && Number.isSafeInteger(entry.total)) {
            const count = Math.min(entry.count, limit);
            model.aiRewards[action][type] = { count, total: Math.max(-20 * count, Math.min(20 * count, entry.total)) };
          }
        }
      }
    }
    return model;
  }

  function validObservation(observation) {
    return Boolean(observation && typeof observation === "object"
      && (observation.played === null || types.includes(observation.played))
      && (observation.guessed === null || types.includes(observation.guessed))
      && (observation.played !== null || observation.guessed !== null)
      && (observation.reward === undefined || observation.reward === null || (["play", "guess"].includes(observation.reward.action)
        && types.includes(observation.reward.card)
        && Number.isInteger(observation.reward.value)
        && Math.abs(observation.reward.value) <= 20)));
  }

  function addObservation(model, observation) {
    if (!validObservation(observation)) throw new Error("Observação inválida.");
    if (observation.played) model.humanPlays[observation.played] = Math.min(limit, model.humanPlays[observation.played] + 1);
    if (observation.guessed) model.humanGuesses[observation.guessed] = Math.min(limit, model.humanGuesses[observation.guessed] + 1);
    model.observations = Math.min(limit, model.observations + 1);
    if (observation.reward) {
      const { action, card, value } = observation.reward;
      const entry = model.aiRewards[action][card];
      if (entry.count < limit) {
        entry.count += 1;
        entry.total += value;
      }
    }
  }

  function valueOf(player) {
    return player.hp * 3 + player.shields * 0.8 + player.luck * 0.6 - player.cards * 0.65;
  }

  function reward(before, after, winner) {
    const change = valueOf(after.ai) - valueOf(before.ai) - valueOf(after.player) + valueOf(before.player);
    return Math.max(-20, Math.min(20, Math.round(change + (winner === "ai" ? 12 : winner === "player" ? -12 : 0))));
  }

  function effectValue(type, owner, guesser, correct, deckCount) {
    const o = { ...owner };
    const g = { ...guesser };
    const before = valueOf(o) - valueOf(g);
    const draw = (count) => { g.cards += Math.min(count, deckCount); };
    const damage = (amount) => {
      const blocked = Math.min(g.shields, amount);
      g.shields -= blocked;
      g.hp = Math.max(0, g.hp - (amount - blocked));
    };
    const luck = (player, amount) => { player.luck = Math.min(5, player.luck + amount); };
    const shield = (player, amount) => { player.shields = Math.min(5, player.shields + amount); };
    let swapValue = 0;
    if (correct) {
      if (type === "tigre" || type === "tartaruga") {
        if (g.hp < 5) g.hp += 1;
        else shield(g, 1);
      } else if (type === "peixe") g.hp = Math.min(5, g.hp + 1);
      else if (["macaco", "vaca", "coelho"].includes(type)) luck(g, 1);
      else if (type === "elefante") shield(g, 1);
    } else {
      switch (type) {
        case "leao": damage(2); draw(1); luck(o, 1); break;
        case "coelho": draw(3); luck(o, 2); break;
        case "vaca": draw(2); shield(o, 2); break;
        case "peixe": draw(2); g.shields = Math.max(0, g.shields - 3); luck(o, 1); o.hp = Math.min(5, o.hp + 1); break;
        case "tigre": damage(1); draw(2); break;
        case "macaco": damage(3); draw(1); shield(o, 2); break;
        case "elefante": g.hp = Math.max(0, g.hp - 1); g.shields = Math.max(0, g.shields - 2); break;
        case "tartaruga": draw(1); g.shields = Math.max(0, g.shields - 1); shield(o, 1); break;
        case "coringa":
          o.hp = Math.min(5, o.hp + 1);
          shield(o, 1);
          if (g.cards > 0 && o.cards > 0 && g.hp > 0) swapValue = 0.5;
          break;
        case "troca":
          if (o.cards > g.cards) swapValue = (o.cards - g.cards) * 1.3;
          break;
      }
    }
    const ownerWins = g.hp <= 0 || o.cards === 0;
    return valueOf(o) - valueOf(g) - before + swapValue + (ownerWins ? 12 : 0);
  }

  function learnedValue(model, action, card) {
    const entry = model.aiRewards[action][card];
    return entry.total / (entry.count + 12);
  }

  globalThis.BlefeAI = Object.freeze({ types, createModel, sanitizeModel, validObservation, addObservation, valueOf, reward, effectValue, learnedValue });
})();
