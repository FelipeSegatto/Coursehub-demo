import ContractCard from "./ContractCard";

export default function ContractSection({
  contracts = [],
}) {
  return (
    <section>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">
          Seus contratos
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          Contratos financeiros vinculados aos cursos em que você
          está matriculado.
        </p>
      </div>

      {contracts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h3 className="font-semibold text-slate-900">
            Nenhum contrato encontrado
          </h3>

          <p className="mt-2 text-sm text-slate-500">
            Ainda não existem contratos financeiros vinculados à sua
            conta.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {contracts.map((contract) => (
            <ContractCard
              key={contract.id}
              contract={contract}
            />
          ))}
        </div>
      )}
    </section>
  );
}