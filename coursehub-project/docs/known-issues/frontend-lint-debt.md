# Frontend lint baseline

## Status

O frontend possui problemas de lint preexistentes que ainda não fazem parte do
escopo das features atuais.

Baseline atual:

- 62 errors;
- 9 warnings;
- 71 ocorrências no total.

A integração das branches e a implementação do academic calendar não
introduziram novos problemas em relação a essa baseline.

## react-hooks/set-state-in-effect

Parte relevante das ocorrências está associada ao padrão manual de data fetching:

```jsx
useEffect(() => {
  loadData();
}, [dependency]);