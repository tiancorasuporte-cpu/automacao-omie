import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { CrmPage } from "@/features/crm/CrmPage";
import type {
  AgendarDados,
  AprovarDados,
  CamposPatch,
  CrmView,
  EnvioDados,
  EquipeDados,
  FinalizarDados,
  MontadoDados,
  NovaOportunidadeDados,
  PrevisaoDados,
  ResultadoDados,
  UploadDocDados,
} from "@/features/crm/ui/tipos-ui";
import type { Documento, EtapaId, RegrasComissao } from "@/features/crm/codigo/types";
import { APP_NAME } from "@/lib/brand";
import {
  createCrmOportunidadeFn,
  crmAgendarFn,
  crmAprovarFn,
  crmDeleteDocFn,
  crmEncerrarContratoFn,
  crmEnvioFn,
  crmEquipeFn,
  crmFinalizarFn,
  crmGetDocFn,
  crmMontadoFn,
  crmNotaFn,
  crmReabrirFn,
  crmResultadoFn,
  crmSaveRegrasFn,
  crmUploadDocFn,
  crmVoltarFn,
  deleteCrmOportunidadeFn,
  getCrmBootstrapFn,
  listCrmOportunidadesFn,
  patchCrmOportunidadeFn,
  vincularCrmOmieClienteFn,
} from "@/lib/crm";
import { requireModule } from "@/lib/require-auth";

function parseView(raw: unknown): CrmView {
  if (raw === "relatorios" || raw === "comissoes" || raw === "quadro") return raw;
  return "quadro";
}

export const Route = createFileRoute("/crm")({
  beforeLoad: () => requireModule("crm"),
  validateSearch: (search: Record<string, unknown>) => ({
    view: parseView(search["view"]),
  }),
  loader: async () => getCrmBootstrapFn(),
  head: () => ({
    meta: [{ title: `CRM Comercial — ${APP_NAME}` }],
  }),
  component: CrmRoutePage,
});

async function fileToPayload(file: File | null) {
  if (!file) return null;
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return {
    name: file.name,
    mime: file.type || "application/octet-stream",
    data: btoa(binary),
    size: file.size,
  };
}

function CrmRoutePage() {
  const data = Route.useLoaderData();
  const { view } = Route.useSearch();
  const navigate = useNavigate({ from: "/crm" });

  const [oportunidades, setOportunidades] = useState(data.oportunidades);
  const [regras, setRegras] = useState(data.regras);

  useEffect(() => {
    setOportunidades(data.oportunidades);
    setRegras(data.regras);
  }, [data.oportunidades, data.regras]);

  /** Só atualiza a lista — sem invalidate (evita travar a UI / loop de loader). */
  const refresh = useCallback(async () => {
    const list = await listCrmOportunidadesFn();
    setOportunidades(list);
  }, []);

  const onViewChange = useCallback(
    (v: CrmView) => {
      void navigate({ search: { view: v } });
    },
    [navigate],
  );

  const eu = useMemo(
    () => ({
      nome: data.user.name,
      comissoes: data.user.comissoes,
      isVendedor: Boolean(data.user.isVendedor),
    }),
    [data.user.name, data.user.comissoes, data.user.isVendedor],
  );

  useEffect(() => {
    if (view === "comissoes" && !eu.comissoes && !eu.isVendedor) {
      void navigate({ search: { view: "quadro" } });
    }
  }, [view, eu.comissoes, eu.isVendedor, navigate]);

  const create = async (d: NovaOportunidadeDados) => {
    const created = await createCrmOportunidadeFn({ data: d });
    if (created) setOportunidades((prev) => [created, ...prev.filter((o) => o.id !== created.id)]);
  };

  const patch = async (id: number, campos: CamposPatch) => {
    await patchCrmOportunidadeFn({ data: { id, campos } });
  };

  const montado = async (id: number, d: MontadoDados) => {
    const arquivo = await fileToPayload(d.arquivo);
    await crmMontadoFn({
      data: {
        id,
        tv: d.tv,
        orc: d.orc,
        modalidade: d.modalidade,
        valor: d.valor,
        total: d.total,
        prazo: d.prazo,
        validade: d.validade,
        obs: d.obs,
        arquivo,
        lido: d.lido,
      },
    });
  };

  const envio = async (id: number, d: EnvioDados) => {
    const arquivo = await fileToPayload(d.arquivo);
    await crmEnvioFn({
      data: {
        id,
        canal: d.canal,
        data: d.data,
        tv: d.tv,
        orc: d.orc,
        modalidade: d.modalidade,
        valor: d.valor,
        total: d.total,
        prazo: d.prazo,
        validade: d.validade,
        obs: d.obs,
        arquivo,
        lido: d.lido,
      },
    });
  };

  const agendar = async (id: number, d: AgendarDados) => {
    await crmAgendarFn({ data: { id, ...d } });
  };

  const resultado = async (id: number, d: ResultadoDados) => {
    await crmResultadoFn({ data: { id, ...d } });
  };

  const aprovar = async (id: number, d: AprovarDados) => {
    await crmAprovarFn({ data: { id, ...d, soPrevisao: false } });
  };

  const previsao = async (id: number, d: PrevisaoDados) => {
    await crmAprovarFn({
      data: {
        id,
        aguardando: d.aguardando,
        data: "",
        prev: d.prev,
        obs: d.obs,
        soPrevisao: true,
      },
    });
  };

  const finalizar = async (id: number, d: FinalizarDados) => {
    const arquivo = await fileToPayload(d.arquivo);
    await crmFinalizarFn({
      data: {
        id,
        st: d.st,
        motivo: d.motivo,
        obs: d.obs,
        concorrente: d.concorrente,
        retomar: d.retomar,
        arquivo,
      },
    });
  };

  const reabrir = async (id: number, motivo: string) => {
    await crmReabrirFn({ data: { id, motivo } });
  };

  const voltar = async (id: number, destino: EtapaId, motivo: string) => {
    await crmVoltarFn({ data: { id, destino, motivo } });
  };

  const nota = async (id: number, texto: string) => {
    await crmNotaFn({ data: { id, texto } });
  };

  const equipe = async (id: number, d: EquipeDados) => {
    await crmEquipeFn({ data: { id, ...d } });
  };

  const uploadDoc = async (id: number, d: UploadDocDados) => {
    const arquivo = await fileToPayload(d.arquivo);
    if (!arquivo) throw new Error("Selecione um arquivo.");
    await crmUploadDocFn({
      data: {
        id,
        etiqueta: d.etiqueta,
        arquivo,
        lido: d.lido,
        tv: d.tv,
        orc: d.orc,
        modalidade: d.modalidade,
        valor: d.valor,
        total: d.total,
        prazo: d.prazo,
        validade: d.validade,
      },
    });
  };

  const deleteDoc = async (id: number, docId: string) => {
    await crmDeleteDocFn({ data: { id, docId } });
  };

  const deleteOportunidade = async (id: number) => {
    await deleteCrmOportunidadeFn({ data: { id } });
    setOportunidades((prev) => prev.filter((o) => o.id !== id));
  };

  const vincularOmie = async (
    id: number,
    d: {
      omieAppId: string;
      codigoClienteOmie: number;
      cliente?: string | null;
      contato?: string | null;
      tel?: string | null;
      cidade?: string | null;
    },
  ) => {
    const updated = await vincularCrmOmieClienteFn({ data: { id, ...d } });
    if (updated) {
      setOportunidades((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
    }
  };

  const saveRegras = async (r: RegrasComissao) => {
    await crmSaveRegrasFn({ data: { regras: r } });
    setRegras(r);
  };

  const encerrarContrato = async (
    id: number,
    d: { fim: string; motivo: string } | null,
  ) => {
    await crmEncerrarContratoFn({ data: { id, contrato: d } });
  };

  const abrirDocumento = async (doc: Documento) => {
    const full = await crmGetDocFn({ data: { docId: doc.id } });
    const mime = full.mime || "application/octet-stream";
    const bin = atob(full.data_base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <AppShell mobileTitle="CRM Comercial">
      <CrmPage
        oportunidades={oportunidades}
        vendedores={data.vendedores}
        tecnicos={data.tecnicos}
        eu={eu}
        regras={regras}
        view={view}
        onViewChange={onViewChange}
        refresh={refresh}
        create={create}
        patch={patch}
        montado={montado}
        envio={envio}
        agendar={agendar}
        resultado={resultado}
        aprovar={aprovar}
        previsao={previsao}
        finalizar={finalizar}
        reabrir={reabrir}
        voltar={voltar}
        nota={nota}
        equipe={equipe}
        uploadDoc={uploadDoc}
        deleteDoc={deleteDoc}
        deleteOportunidade={deleteOportunidade}
        vincularOmie={vincularOmie}
        saveRegras={saveRegras}
        encerrarContrato={encerrarContrato}
        abrirDocumento={abrirDocumento}
      />
    </AppShell>
  );
}
