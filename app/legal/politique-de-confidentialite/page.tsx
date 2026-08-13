import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Politique de confidentialité — MW Multiservices',
  description: 'Politique de confidentialité du CRM interne de MW Multiservices.',
}

const CONTACT_EMAIL = 'william.yelle@mwmultiservices.ca'
const UPDATED = '13 août 2026'

export default function PrivacyPolicyPage() {
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
          Politique de confidentialité
        </h1>
        <p style={{ opacity: 0.7, fontSize: 14, marginBottom: 32 }}>
          MW Multiservices — dernière mise à jour : {UPDATED}
        </p>

        <Section title="1. À propos de cette application">
          <p>
            Ce CRM (« l&rsquo;Application ») est un outil interne utilisé par MW
            Multiservices (fenêtres et paysagement) pour gérer ses ventes, ses
            clients, ses soumissions et sa facturation. Il est réservé aux
            employés et sous-traitants autorisés de MW Multiservices — il n&rsquo;est
            pas destiné au grand public.
          </p>
        </Section>

        <Section title="2. Renseignements que nous recueillons">
          <p>Dans le cadre normal de son utilisation, l&rsquo;Application traite :</p>
          <ul>
            <li>
              les coordonnées et informations de nos clients (nom, adresse,
              téléphone, courriel, services demandés, notes de suivi) ;
            </li>
            <li>
              les échanges par texto (SMS) liés au suivi commercial ;
            </li>
            <li>
              les informations relatives aux employés nécessaires à
              l&rsquo;exploitation (nom, rôle, feuilles de temps, commissions) ;
            </li>
            <li>
              les soumissions, factures et données comptables associées, y
              compris celles synchronisées avec QuickBooks (Intuit) lorsque
              l&rsquo;intégration est activée.
            </li>
          </ul>
        </Section>

        <Section title="3. Utilisation des renseignements">
          <p>
            Ces renseignements servent uniquement à l&rsquo;exploitation interne de
            MW Multiservices : suivi des ventes et des clients, planification
            des travaux, facturation, comptabilité et paie. Nous ne vendons ni
            ne louons ces renseignements à des tiers.
          </p>
        </Section>

        <Section title="4. Partage avec des fournisseurs de services">
          <p>
            Pour fonctionner, l&rsquo;Application s&rsquo;appuie sur les fournisseurs
            suivants, chacun lié par ses propres conditions et politiques de
            confidentialité :
          </p>
          <ul>
            <li><strong>Supabase</strong> — hébergement de la base de données ;</li>
            <li><strong>Vercel</strong> — hébergement de l&rsquo;application web ;</li>
            <li><strong>Twilio</strong> — envoi et réception des messages texto (SMS) ;</li>
            <li>
              <strong>Intuit / QuickBooks</strong> — synchronisation des devis,
              factures et fiches clients à des fins comptables, lorsque
              connecté par un administrateur.
            </li>
          </ul>
        </Section>

        <Section title="5. Conservation et sécurité">
          <p>
            Les renseignements sont conservés aussi longtemps que nécessaire à
            l&rsquo;exploitation de l&rsquo;entreprise ou aux obligations légales
            (notamment comptables et fiscales). L&rsquo;accès à l&rsquo;Application est
            restreint par authentification et par des permissions selon le
            rôle de chaque employé.
          </p>
        </Section>

        <Section title="6. Droits d'accès">
          <p>
            Un client ou un employé souhaitant consulter, corriger ou faire
            supprimer les renseignements le concernant peut en faire la
            demande à l&rsquo;adresse ci-dessous.
          </p>
        </Section>

        <Section title="7. Contact">
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
