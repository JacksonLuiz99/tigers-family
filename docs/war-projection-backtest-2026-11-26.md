# Avaliação da projeção da guerra

Consulta somente de leitura ao D1 em 26/11/2026. A amostra tem **26 guerras comuns** encerradas entre 15/11 e 26/11, com **1.132 ataques** ordenados e alvos identificados. Não havia guerras de Liga detalhadas para avaliar. Dos **1.255 ataques disponíveis**, **123 não foram usados**.

## Método

Em cada guerra, a sequência registrada de ataques foi interrompida no ponto em que a regra atual começa a projetar: `min(10, max(3, ceil(40% dos ataques disponíveis)))`. A taxa de triplos até esse ponto foi aplicada a todos os ataques ainda disponíveis. A previsão resultante foi comparada aos triplos realmente registrados no fim da guerra. Para o sinal de fechamento, foram contadas bases distintas que receberam três estrelas.

## Resultado

| Indicador | Resultado |
| --- | ---: |
| Erro absoluto médio no total de triplos | 7,69 por guerra |
| Viés médio | 5,69 triplos acima do resultado |
| Guerras com total superestimado | 20 de 26 |
| Ritmo numericamente suficiente | 22 de 26 |
| Dessas, bases efetivamente fechadas | 17 de 22 |

Repetir a simulação em 50% dos ataques disponíveis, sem o teto de dez, reduziu o erro absoluto médio para 5,46, mas ainda produziu **cinco sinais de fechamento que não se confirmaram**. Em 65%, houve sete. Esses pontos aparecem mais tarde na guerra e não medem a utilidade de uma decisão tomada antes.

## Decisão e limites

O texto do painel passou a dizer que a estimativa pressupõe **todos os ataques restantes realizados no mesmo ritmo e em alvos ainda abertos**. O limite de amostra permanece igual: esta amostra curta não justifica calibrá-lo, e elevar o limite não eliminou os sinais otimistas. A simulação não aciona cobranças nem notificações.

Os dados cobrem apenas guerras detalhadas que o monitor guardou. A ordem dos ataques foi usada como sequência; não há horário individual para reproduzir exatamente quando uma liderança teria consultado o painel. O resultado não pode ser extrapolado para Liga, guerras privadas ou outros períodos.
