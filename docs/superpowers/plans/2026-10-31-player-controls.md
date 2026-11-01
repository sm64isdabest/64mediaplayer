# Controles essenciais do player — plano de implementação

> **Para agentes executores:** usar `superpowers:executing-plans` para execução nativa. Cada tarefa termina com verificação, commit e push.

**Objetivo:** Reproduzir os MP3 remotos com controles básicos, modos de loop/shuffle, escopo por pastas e Media Session.

**Arquitetura:** Um `<audio>` HTML nativo transmite o `Track.url`. Uma ordem explícita de IDs implementa navegação linear e shuffle sem repetição dentro do ciclo; os controles ficam em uma barra inferior grande e a Media Session espelha a faixa e as ações atuais.

**Stack:** HTML/CSS/JavaScript vanilla, Node `node:test`, GitHub Pages e GitHub Release.

**Spec:** [../specs/2026-10-31-player-controls-design.md](../specs/2026-10-31-player-controls-design.md)

## Restrições globais

- Não adicionar áudio ao Git, IndexedDB, pacote Pages ou cache do service worker.
- Não configurar `crossOrigin` no áudio; o endpoint atual não fornece CORS.
- Não implementar Web Audio, crossfade ou EQ nesta etapa.
- Não avançar para fila, histórico, busca ou favoritos antes da confirmação no Quest.
- Preservar a virtualização da lista e controles tocáveis no Quest.
- Fazer commit/push de alterações selecionadas; não usar `git add -A`.

## Revisão

1. Shuffle deve percorrer cada faixa do escopo uma vez por ciclo, mesmo com aleatoriedade degenerada — testar permutação e reinício do ciclo.
2. Repetição da faixa só afeta fim natural; próxima manual deve avançar — testar separadamente.
3. Troca de pasta não pode deixar a faixa atual fora do escopo tocando ou aparecer em próxima/anterior — testar reset do modelo.
4. Seek em duração ainda desconhecida não pode gerar NaN; seek e volume devem respeitar limites — testar helpers.
5. Media Session ausente ou handlers não suportados não podem bloquear controles visuais — isolar chamadas opcionais.

---

### Task 1: Implementar reprodução, escopo, modos e Media Session

**Arquivos:**
- Modificar: `app.js`
- Modificar: `index.html`
- Modificar: `style.css`
- Modificar: `tests/app.test.js`
- Modificar: `tests/shell.test.js`

**Interfaces:**
- `buildPlayOrder(tracks, shuffle, random, currentId) -> string[]` produz ordem de IDs para o escopo atual.
- `adjacentTrackId(order, currentId, direction, loopMode, automatic) -> string|null` implementa fim/início e loop.
- `seekTarget(value, duration) -> number|null` limita seek a segundos válidos ou retorna `null` sem duração.
- `loadCatalog(url)` segue validando a fonte atual de faixas.

- [x] **Passo 1: Escrever testes RED** para Fisher–Yates sem repetição, faixa atual no início do novo ciclo, anterior/próxima e loop de faixa automático vs. manual, escopo por pastas e seek com valores inválidos.
- [x] **Passo 2: Rodar os testes focalizados** e confirmar as falhas esperadas.
- [x] **Passo 3: Implementar o modelo de navegação** em `app.js`, mantendo a reprodução vinculada à lista filtrada.
- [x] **Passo 4: Integrar `<audio>` e Media Session** com tratamento de autoplay/rede/compatibilidade; não solicitar CORS.
- [x] **Passo 5: Criar barra inferior e seletor multi-pasta** com alvos grandes, estados acessíveis e uso responsivo no Quest.
- [x] **Passo 6: Rodar `node --test tests/*.test.js`, `node --check app.js` e `git diff --check`; verificar virtualização e que o service worker não armazena áudio**.
- [x] **Passo 7: Commit e push** somente interface, app e testes desta tarefa.

## Parada desta etapa

Publicar os controles básicos e entregar o link para teste no Quest. Aguardar confirmação de reprodução em segundo plano e Media Session antes de planejar crossfade/Web Audio.
