import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireMembership } from "@/lib/auth";
import { canManageBusiness, canManageSettings } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import type {
  Branch,
  Business,
  BusinessInvitation,
  MemberRole,
  Service,
} from "@/lib/database.types";

import { PUBLIC_BUCKET } from "@/lib/storage";
import { FileUpload } from "@/components/file-upload";
import {
  AddBranchForm,
  AddServiceForm,
  BusinessProfileForm,
} from "./settings-forms";
import { TeamManagement } from "./team-management";
import { uploadBusinessLogo } from "./logo-actions";

type MemberRow = {
  id: string;
  role: MemberRole;
  user_id: string;
  profile: { full_name: string | null } | null;
};

export default async function BusinessSettingsPage() {
  const { member, business } = await requireMembership();
  const isOwner = canManageBusiness(member.role);
  const canManage = canManageSettings(member.role);
  const logoUrl = (business.branding as Record<string, unknown> | null)
    ?.logo_url as string | undefined;
  const supabase = await createClient();

  const [{ data: branches }, { data: services }] = await Promise.all([
    supabase
      .from("branches")
      .select("*")
      .order("created_at", { ascending: true }),
    supabase
      .from("services")
      .select("*")
      .order("created_at", { ascending: true }),
  ]);
  const typedBranches = (branches ?? []) as Branch[];
  const typedServices = (services ?? []) as Service[];

  const [{ data: memberRows }, { data: inviteRows }] = await Promise.all([
    supabase
      .from("business_members")
      .select("id, role, user_id, profile:profiles(full_name)")
      .eq("business_id", business.id)
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
    supabase
      .from("business_invitations")
      .select("id, email, role, status")
      .eq("business_id", business.id)
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
  ]);

  const members = ((memberRows ?? []) as unknown as MemberRow[]).map((m) => ({
    id: m.id,
    role: m.role,
    name: m.profile?.full_name ?? "Teammate",
  }));
  const pending = ((inviteRows ?? []) as Pick<
    BusinessInvitation,
    "id" | "email" | "role"
  >[]).map((i) => ({ id: i.id, email: i.email, role: i.role }));

  return (
    <>
      <PageHeader
        title="Business settings"
        description="Profile, branches, and services."
      />
      <div className="flex flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Business profile</CardTitle>
            <CardDescription>Your company information.</CardDescription>
          </CardHeader>
          <CardContent>
            <BusinessProfileForm
              business={business as Business}
              canEdit={isOwner}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Branding</CardTitle>
            <CardDescription>
              Your logo appears on the customer portal and documents.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt="Business logo"
                className="h-16 w-auto rounded-lg border bg-white object-contain p-2"
              />
            ) : (
              <p className="text-muted-foreground text-sm">No logo uploaded.</p>
            )}
            {isOwner && (
              <FileUpload
                bucket={PUBLIC_BUCKET}
                businessId={business.id}
                entity="branding"
                accept="image/*"
                label="Upload logo"
                onUpload={uploadBusinessLogo}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Branches</CardTitle>
            <CardDescription>Locations you operate from.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {typedBranches.length === 0 ? (
              <p className="text-muted-foreground text-sm">No branches yet.</p>
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Email</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {typedBranches.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">{b.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {b.phone ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {b.email ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {canManage && <AddBranchForm />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Services</CardTitle>
            <CardDescription>What you offer to customers.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {typedServices.length === 0 ? (
              <p className="text-muted-foreground text-sm">No services yet.</p>
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-end">Default price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {typedServices.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {s.description ?? "—"}
                        </TableCell>
                        <TableCell className="text-end tabular-nums">
                          {s.default_price != null
                            ? `AED ${s.default_price}`
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {canManage && <AddServiceForm />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Team</CardTitle>
            <CardDescription>
              Members and invitations. Invite managers and service advisors by email —
              they join after signing up with that address.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TeamManagement
              members={members}
              pending={pending}
              canManage={isOwner}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
