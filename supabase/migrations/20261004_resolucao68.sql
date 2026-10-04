-- Adequação à Resolução SEDUC nº 68/2026
-- Persiste encaminhamentos (antes só ficavam no aparelho/planilha) e os dados
-- de registro, gradação e afastamento preventivo temporário exigidos pela resolução.
alter table public.incidents
  add column if not exists professor_referrals jsonb,
  add column if not exists management_referrals jsonb,
  add column if not exists resolucao68 jsonb;

comment on column public.incidents.resolucao68 is
  'Dados da Res. SEDUC 68/2026: nível (Art. 5º), data de ciência e registro Conviva (Art. 9º), manifestação do estudante, comunicação à família e afastamento preventivo temporário (Arts. 11-12).';
