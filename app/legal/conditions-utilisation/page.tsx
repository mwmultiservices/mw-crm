import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: "Conditions d'utilisation — MW Multiservices",
  description: "Conditions d'utilisation du CRM interne de MW Multiservices.",
}

const CONTACT_EMAIL = 'william.yelle@mwmultiservices.ca'
const UPDATED = '13 août 2026'

export default function EulaPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#0D1F1F',
        color: '#F1F2F2',
        padding: '48px 20px',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <article style={{ maxWidth: 720, width: '100%', lineHeight: 1.65 }}>
        <h1 style={{ fontSize: 28, marginBottom: 4, color: '#69C9CA' }}>
          Conditions d&rsquo;utilisation
        </h1>
        <p style={{ opacity: 0.7, fontSize: 14, marginBottom: 32 }}>
          MW Multiservices — dernière mise à jour : {UPDATED}
        </p>

        <Section title="1. Objet">
          <p>
            Ce CRM (« l&rsquo;Application ») est un outil logiciel interne
            appartenant à MW Multiservices, développé pour la gestion de ses
            ventes, de sa clientèle, de sa planification et de sa facturation.
            En accédant à l&rsquo;Application, vous acceptez les présentes
            conditions.
          </p>
        </Section>

        <Section title="2. Accès">
          <p>
            L&rsquo;accès est réservé aux employés, représentants et
            sous-traitants autorisés de MW Multiservices, au moyen d&rsquo;un
            compte nominatif. Chaque utilisateur est responsable de la
            confidentialité de ses identifiants et de toute activité effectuée
            sous son compte.
          </p>
        </Section>

        <Section title="3. Licence d'utilisation">
          <p>
            MW Multiservices accorde à chaque utilisateur autorisé une
            licence limitée, non exclusive et non transférable d&rsquo;utiliser
            l&rsquo;Application dans le seul cadre de ses fonctions au sein de
            l&rsquo;entreprise. Il est interdit de copier, revendre, redistribuer
            ou tenter d&rsquo;extraire le code source de l&rsquo;Application.
          </p>
        </Section>

        <Section title="4. Usage acceptable">
          <p>
            L&rsquo;Application doit être utilisée de bonne foi, uniquement à des
            fins professionnelles liées aux activités de MW Multiservices. Les
            données saisies (clients, soumissions, communications, feuilles
            de temps) doivent être exactes dans la mesure du possible.
          </p>
        </Section>

        <Section title="5. Intégrations tierces">
          <p>
            L&rsquo;Application peut se connecter à des services tiers (dont
            QuickBooks/Intuit pour la comptabilité, Twilio pour les textos, et
            l&rsquo;hébergement Supabase/Vercel). L&rsquo;utilisation de ces
            intégrations est soumise, en plus des présentes conditions, aux
            conditions propres à chacun de ces services.
          </p>
        </Section>

        <Section title="6. Propriété">
          <p>
            L&rsquo;Application, son code et sa marque demeurent la propriété de
            MW Multiservices. Les données saisies par les clients et employés
            demeurent la propriété de MW Multiservices, sous réserve des
            droits applicables aux renseignements personnels.
          </p>
        </Section>

        <Section title="7. Limitation de responsabilité">
          <p>
            L&rsquo;Application est fournie « telle quelle », sans garantie
            d&rsquo;absence d&rsquo;erreur ou d&rsquo;interruption. MW Multiservices ne peut
            être tenue responsable des pertes indirectes résultant de son
            utilisation.
          </p>
        </Section>

        <Section title="8. Résiliation d'accès">
          <p>
            L&rsquo;accès d&rsquo;un utilisateur peut être révoqué en tout temps,
            notamment à la fin de son lien d&rsquo;emploi ou de contrat avec MW
            Multiservices.
          </p>
        </Section>

        <Section title="9. Contact">
          <p>
            MW Multiservices —{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: '#69C9CA' }}>
              {CONTACT_EMAIL}
            </a>
          </p>
        </Section>
      </article>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 18, marginBottom: 8, color: '#F1F2F2' }}>{title}</h2>
      <div style={{ color: '#D1D5DB', fontSize: 15 }}>{children}</div>
    </section>
  )
}
