

## Plano: Remover o Popup de Segurança

### O que será feito
Remover completamente o componente `SecurityPopup` e suas referências para que a aplicação funcione normalmente sem o overlay bloqueante.

### Alterações

1. **Deletar** `src/components/SecurityPopup.tsx`

2. **Editar** `src/App.tsx` — remover o import e o uso de `<SecurityPopup />`

3. **Editar** `src/index.css` — remover os CSS variables `--security-*` que não são mais necessários

