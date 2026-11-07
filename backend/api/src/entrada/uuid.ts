/** Formato de uuid dos ids de rota (`grupoId`, jogador, conta, convite, habilidade): fora dele, 404 sem consultar o banco. */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
