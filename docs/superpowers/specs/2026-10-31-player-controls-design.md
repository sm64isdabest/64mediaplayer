# Player: controles essenciais

## Intenção

Depois da confirmação no Quest de que o catálogo público carrega, adicionar reprodução básica da biblioteca por streaming. A lista de MP3 continua na GitHub Release; o navegador baixa somente a faixa solicitada.

## Objetivos

- Implementar play/pause, anterior/próxima, seek e volume.
- Oferecer repetição desligada, da faixa ou da lista.
- Oferecer shuffle por permutação Fisher–Yates, sem repetir até percorrer a coleção filtrada.
- Permitir escopo em todas as pastas ou em várias pastas escolhidas.
- Expor título, artista e ações de transporte pela Media Session quando o navegador suportar.
- Manter controles grandes e utilizáveis por ponteiro no Quest.

## Fora de escopo

- Crossfade, EQ ou quaisquer efeitos de Web Audio. O asset testado responde sem CORS e o uso de `MediaElementAudioSourceNode` seria bloqueado.
- Fila editável, histórico, busca, favoritos, sleep timer, contadores e persistência de estado.
- Cache ou download offline de MP3.
- Capas por faixa: elas não estão no catálogo publicado; a Media Session usa a identidade genérica do app quando aceita pelo navegador.

## Abordagem

Usar um `<audio>` HTML nativo apontando para o `Track.url`, sem `crossOrigin`, com controles HTML personalizados e Media Session. Isso mantém a reprodução direta do navegador e evita uma Web Audio graph antes da etapa de crossfade. A permutação aleatória é criada uma vez por ciclo e avançada por índice; repetir lista gera novo ciclo, sem repetir uma faixa dentro do ciclo.

## Comportamentos

- Clicar numa faixa inicia sua reprodução e define o ponto atual da ordem.
- Anterior reinicia a faixa se já passou de 3 segundos; senão volta uma faixa. Próxima manual avança mesmo em repetição da faixa.
- Ao terminar: repetição da faixa reinicia; repetição da lista avança ou cria novo ciclo de shuffle; repetição desligada para ao chegar ao fim.
- Marcar uma ou mais pastas limita a lista e a ordem de reprodução. “Todas as pastas” limpa a seleção.
- O estado de áudio e as ações da Media Session refletem o deck. Erros de rede aparecem na interface sem simular reprodução.

## Validação no dispositivo

Testes automatizados cobrem a ordem e as transições; o usuário confirma play/pause, navegação, volume, seek, filtros e controles da tela bloqueada/no fundo no Quest antes da etapa 3. O cabeçalho de áudio segue genérico e sem CORS, conforme anotado no README; reprodução HTML básica ainda precisa de teste no headset.
