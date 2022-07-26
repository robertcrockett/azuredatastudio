/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as azdata from 'azdata';
import * as vscode from 'vscode';
import { logError, TelemetryViews } from '../telemtery';
import * as loc from '../constants/strings';
import { IconPath, IconPathHelper } from '../constants/iconPathHelper';
import { MigrationStatusDialog } from '../dialog/migrationStatus/migrationStatusDialog';
import { AdsMigrationStatus } from '../dialog/migrationStatus/migrationStatusDialogModel';
import { filterMigrations } from '../api/utils';
import * as styles from '../constants/styles';
import * as nls from 'vscode-nls';
import { SelectMigrationServiceDialog } from '../dialog/selectMigrationService/selectMigrationServiceDialog';
import { DatabaseMigration } from '../api/azure';
import { getCurrentMigrations, getSelectedServiceStatus, isServiceContextValid, MigrationLocalStorage } from '../models/migrationLocalStorage';
const localize = nls.loadMessageBundle();

interface IActionMetadata {
	title?: string,
	description?: string,
	link?: string,
	iconPath?: azdata.ThemedIconPath,
	command?: string;
}

const maxWidth = 800;
const BUTTON_CSS = {
	'font-size': '13px',
	'line-height': '18px',
	'margin': '4px 0',
	'text-align': 'left',
};

interface StatusCard {
	container: azdata.DivContainer;
	count: azdata.TextComponent,
	textContainer?: azdata.FlexContainer,
	warningContainer?: azdata.FlexContainer,
	warningText?: azdata.TextComponent,
}

export class DashboardWidget {
	private _context: vscode.ExtensionContext;
	private _migrationStatusCardsContainer!: azdata.FlexContainer;
	private _migrationStatusCardLoadingContainer!: azdata.LoadingComponent;
	private _view!: azdata.ModelView;
	private _inProgressMigrationButton!: StatusCard;
	private _inProgressWarningMigrationButton!: StatusCard;
	private _allMigrationButton!: StatusCard;
	private _successfulMigrationButton!: StatusCard;
	private _failedMigrationButton!: StatusCard;
	private _completingMigrationButton!: StatusCard;
	private _selectServiceText!: azdata.TextComponent;
	private _serviceContextButton!: azdata.ButtonComponent;
	private _refreshButton!: azdata.ButtonComponent;

	private _disposables: vscode.Disposable[] = [];
	private isRefreshing: boolean = false;

	public onDialogClosed = async (): Promise<void> => {
		const label = await getSelectedServiceStatus();
		this._serviceContextButton.label = label;
		this._serviceContextButton.title = label;
		await this.refreshMigrations();
	};

	constructor(context: vscode.ExtensionContext) {
		this._context = context;
	}

	public register(): void {
		azdata.ui.registerModelViewProvider('migration.dashboard', async (view) => {
			this._view = view;

			const container = view.modelBuilder.flexContainer().withLayout({
				flexFlow: 'column',
				width: '100%',
				height: '100%'
			}).component();

			const header = this.createHeader(view);
			// Files need to have the vscode-file scheme to be loaded by ADS
			const watermarkUri = vscode.Uri
				.file(<string>IconPathHelper.migrationDashboardHeaderBackground.light)
				.with({ scheme: 'vscode-file' });

			container.addItem(header, {
				CSSStyles: {
					'background-image': `
						url(${watermarkUri}),
						linear-gradient(0deg, rgba(0, 0, 0, 0.05) 0%, rgba(0, 0, 0, 0) 100%)
					`,
					'background-repeat': 'no-repeat',
					'background-position': '91.06% 100%',
					'margin-bottom': '20px'
				}
			});

			const tasksContainer = await this.createTasks(view);
			header.addItem(tasksContainer, {
				CSSStyles: {
					'width': `${maxWidth}px`,
					'margin': '24px'
				}
			});
			container.addItem(await this.createFooter(view), {
				CSSStyles: {
					'margin': '0 24px'
				}
			});
			this._disposables.push(
				this._view.onClosed(e => {
					this._disposables.forEach(
						d => { try { d.dispose(); } catch { } });
				}));

			await view.initializeModel(container);
			await this.refreshMigrations();
		});
	}

	private createHeader(view: azdata.ModelView): azdata.FlexContainer {
		const header = view.modelBuilder.flexContainer().withLayout({
			flexFlow: 'column',
			width: maxWidth,
		}).component();
		const titleComponent = view.modelBuilder.text().withProps({
			value: loc.DASHBOARD_TITLE,
			width: '750px',
			CSSStyles: {
				...styles.DASHBOARD_TITLE_CSS
			}
		}).component();

		const descriptionComponent = view.modelBuilder.text().withProps({
			value: loc.DASHBOARD_DESCRIPTION,
			CSSStyles: {
				...styles.NOTE_CSS
			}
		}).component();
		header.addItems([titleComponent, descriptionComponent], {
			CSSStyles: {
				'width': `${maxWidth}px`,
				'padding-left': '24px'
			}
		});
		return header;
	}

	private async createTasks(view: azdata.ModelView): Promise<azdata.Component> {
		const tasksContainer = view.modelBuilder.flexContainer().withLayout({
			flexFlow: 'row',
			width: '100%',
		}).component();

		const migrateButtonMetadata: IActionMetadata = {
			title: loc.DASHBOARD_MIGRATE_TASK_BUTTON_TITLE,
			description: loc.DASHBOARD_MIGRATE_TASK_BUTTON_DESCRIPTION,
			iconPath: IconPathHelper.sqlMigrationLogo,
			command: 'sqlmigration.start'
		};

		const preRequisiteListTitle = view.modelBuilder.text().withProps({
			value: loc.PRE_REQ_TITLE,
			CSSStyles: {
				...styles.BODY_CSS,
				'margin': '0px',
			}
		}).component();

		const migrateButton = this.createTaskButton(view, migrateButtonMetadata);

		const preRequisiteListElement = view.modelBuilder.text().withProps({
			value: [
				loc.PRE_REQ_1,
				loc.PRE_REQ_2,
				loc.PRE_REQ_3
			],
			CSSStyles: {
				...styles.SMALL_NOTE_CSS,
				'padding-left': '12px',
				'margin': '-0.5em 0px',
			}
		}).component();

		const preRequisiteLearnMoreLink = view.modelBuilder.hyperlink().withProps({
			label: loc.LEARN_MORE,
			ariaLabel: loc.LEARN_MORE_ABOUT_PRE_REQS,
			url: 'https://aka.ms/azuresqlmigrationextension',
		}).component();

		const preReqContainer = view.modelBuilder.flexContainer().withItems([
			preRequisiteListTitle,
			preRequisiteListElement,
			preRequisiteLearnMoreLink
		]).withLayout({
			flexFlow: 'column'
		}).component();

		tasksContainer.addItem(migrateButton, {});
		tasksContainer.addItems([preReqContainer], {
			CSSStyles: {
				'margin-left': '20px'
			}
		});
		return tasksContainer;
	}

	private createTaskButton(view: azdata.ModelView, taskMetaData: IActionMetadata): azdata.Component {
		const maxHeight: number = 84;
		const maxWidth: number = 236;
		const buttonContainer = view.modelBuilder.button().withProps({
			buttonType: azdata.ButtonType.Informational,
			description: taskMetaData.description,
			height: maxHeight,
			iconHeight: 32,
			iconPath: taskMetaData.iconPath,
			iconWidth: 32,
			label: taskMetaData.title,
			title: taskMetaData.title,
			width: maxWidth,
			CSSStyles: {
				'border': '1px solid',
				'display': 'flex',
				'flex-direction': 'column',
				'justify-content': 'flex-start',
				'border-radius': '4px',
				'transition': 'all .5s ease',
			}
		}).component();
		this._disposables.push(
			buttonContainer.onDidClick(async () => {
				if (taskMetaData.command) {
					await vscode.commands.executeCommand(taskMetaData.command);
				}
			}));
		return view.modelBuilder.divContainer().withItems([buttonContainer]).component();
	}

	public async refreshMigrations(): Promise<void> {
		if (this.isRefreshing) {
			return;
		}

		this.isRefreshing = true;
		this._migrationStatusCardLoadingContainer.loading = true;
		let migrations: DatabaseMigration[] = [];
		try {
			migrations = await getCurrentMigrations();
		} catch (e) {
			logError(TelemetryViews.SqlServerDashboard, 'RefreshgMigrationFailed', e);
			void vscode.window.showErrorMessage(loc.DASHBOARD_REFRESH_MIGRATIONS(e.message));
		}

		const inProgressMigrations = filterMigrations(migrations, AdsMigrationStatus.ONGOING);
		let warningCount = 0;
		for (let i = 0; i < inProgressMigrations.length; i++) {
			if (inProgressMigrations[i].properties.migrationFailureError?.message ||
				inProgressMigrations[i].properties.migrationStatusDetails?.fileUploadBlockingErrors ||
				inProgressMigrations[i].properties.migrationStatusDetails?.restoreBlockingReason) {
				warningCount += 1;
			}
		}
		if (warningCount > 0) {
			this._inProgressWarningMigrationButton.warningText!.value = loc.MIGRATION_INPROGRESS_WARNING(warningCount);
			this._inProgressMigrationButton.container.display = 'none';
			this._inProgressWarningMigrationButton.container.display = '';
		} else {
			this._inProgressMigrationButton.container.display = '';
			this._inProgressWarningMigrationButton.container.display = 'none';
		}

		this._inProgressMigrationButton.count.value = inProgressMigrations.length.toString();
		this._inProgressWarningMigrationButton.count.value = inProgressMigrations.length.toString();

		this._updateStatusCard(migrations, this._successfulMigrationButton, AdsMigrationStatus.SUCCEEDED, true);
		this._updateStatusCard(migrations, this._failedMigrationButton, AdsMigrationStatus.FAILED);
		this._updateStatusCard(migrations, this._completingMigrationButton, AdsMigrationStatus.COMPLETING);
		this._updateStatusCard(migrations, this._allMigrationButton, AdsMigrationStatus.ALL, true);

		await this._updateSummaryStatus();
		this.isRefreshing = false;
		this._migrationStatusCardLoadingContainer.loading = false;
	}

	private _updateStatusCard(
		migrations: DatabaseMigration[],
		card: StatusCard,
		status: AdsMigrationStatus,
		show?: boolean): void {
		const list = filterMigrations(migrations, status);
		const count = list?.length || 0;
		card.container.display = count > 0 || show ? '' : 'none';
		card.count.value = count.toString();
	}
	private createStatusCard(
		cardIconPath: IconPath,
		cardTitle: string,
		hasSubtext: boolean = false
	): StatusCard {
		const buttonWidth = '400px';
		const buttonHeight = hasSubtext ? '70px' : '50px';
		const statusCard = this._view.modelBuilder.flexContainer()
			.withProps({
				CSSStyles: {
					'width': buttonWidth,
					'height': buttonHeight,
					'align-items': 'center',
				}
			}).component();

		const statusIcon = this._view.modelBuilder.image()
			.withProps({
				iconPath: cardIconPath!.light,
				iconHeight: 24,
				iconWidth: 24,
				height: 32,
				CSSStyles: { 'margin': '0 8px' }
			}).component();

		const textContainer = this._view.modelBuilder.flexContainer()
			.withLayout({ flexFlow: 'column' })
			.component();

		const cardTitleText = this._view.modelBuilder.text()
			.withProps({ value: cardTitle })
			.withProps({
				CSSStyles: {
					...styles.SECTION_HEADER_CSS,
					'width': '240px',
				}
			}).component();
		textContainer.addItem(cardTitleText);

		const cardCount = this._view.modelBuilder.text().withProps({
			value: '0',
			CSSStyles: {
				...styles.BIG_NUMBER_CSS,
				'margin': '0 0 0 8px',
				'text-align': 'center',
			}
		}).component();

		let warningContainer;
		let warningText;
		if (hasSubtext) {
			const warningIcon = this._view.modelBuilder.image()
				.withProps({
					iconPath: IconPathHelper.warning,
					iconWidth: 12,
					iconHeight: 12,
					width: 12,
					height: 18,
				}).component();

			const warningDescription = '';
			warningText = this._view.modelBuilder.text().withProps({ value: warningDescription })
				.withProps({
					CSSStyles: {
						...styles.BODY_CSS,
						'padding-left': '8px',
					}
				}).component();

			warningContainer = this._view.modelBuilder.flexContainer()
				.withItems(
					[warningIcon, warningText],
					{ flex: '0 0 auto' })
				.withProps({
					CSSStyles: { 'align-items': 'center' }
				}).component();

			textContainer.addItem(warningContainer);
		}

		statusCard.addItems([
			statusIcon,
			textContainer,
			cardCount,
		]);

		const compositeButton = this._view.modelBuilder.divContainer()
			.withItems([statusCard])
			.withProps({
				ariaRole: 'button',
				ariaLabel: loc.SHOW_STATUS,
				clickable: true,
				CSSStyles: {
					'height': buttonHeight,
					'margin-bottom': '16px',
					'border': '1px solid',
					'display': 'flex',
					'flex-direction': 'column',
					'justify-content': 'flex-start',
					'border-radius': '4px',
					'transition': 'all .5s ease',
				}
			}).component();
		return {
			container: compositeButton,
			count: cardCount,
			textContainer: textContainer,
			warningContainer: warningContainer,
			warningText: warningText
		};
	}

	private async createFooter(view: azdata.ModelView): Promise<azdata.Component> {
		const footerContainer = view.modelBuilder.flexContainer().withLayout({
			flexFlow: 'row',
			width: maxWidth,
			justifyContent: 'flex-start'
		}).component();
		const statusContainer = await this.createMigrationStatusContainer(view);
		const videoLinksContainer = this.createVideoLinks(view);
		footerContainer.addItem(statusContainer);
		footerContainer.addItem(videoLinksContainer, {
			CSSStyles: {
				'padding-left': '8px',
			}
		});

		return footerContainer;
	}

	private async createMigrationStatusContainer(view: azdata.ModelView): Promise<azdata.FlexContainer> {
		const statusContainer = view.modelBuilder.flexContainer().withLayout({
			flexFlow: 'column',
			width: '400px',
			height: '385px',
			justifyContent: 'flex-start',
		}).withProps({
			CSSStyles: {
				'border': '1px solid rgba(0, 0, 0, 0.1)',
				'padding': '10px',
			}
		}).component();

		const statusContainerTitle = view.modelBuilder.text()
			.withProps({
				value: loc.DATABASE_MIGRATION_STATUS,
				width: '100%',
				CSSStyles: { ...styles.SECTION_HEADER_CSS }
			}).component();

		this._refreshButton = view.modelBuilder.button()
			.withProps({
				label: loc.REFRESH,
				iconPath: IconPathHelper.refresh,
				iconHeight: 16,
				iconWidth: 16,
				width: 70,
				CSSStyles: { 'float': 'right' }
			}).component();

		const statusHeadingContainer = view.modelBuilder.flexContainer()
			.withItems([
				statusContainerTitle,
				this._refreshButton,
			]).withLayout({
				alignContent: 'center',
				alignItems: 'center',
				flexFlow: 'row',
			}).component();

		this._disposables.push(
			this._refreshButton.onDidClick(async (e) => {
				this._refreshButton.enabled = false;
				await this.refreshMigrations();
				this._refreshButton.enabled = true;
			}));

		const buttonContainer = view.modelBuilder.flexContainer()
			.withProps({
				CSSStyles: {
					'justify-content': 'left',
					'align-iems': 'center',
				},
			})
			.component();

		buttonContainer.addItem(
			await this.createServiceSelector(this._view));

		this._selectServiceText = view.modelBuilder.text()
			.withProps({
				value: loc.SELECT_SERVICE_MESSAGE,
				CSSStyles: {
					'font-size': '12px',
					'margin': '10px',
					'font-weight': '350',
					'text-align': 'center',
					'display': 'none'
				}
			}).component();

		const header = view.modelBuilder.flexContainer()
			.withItems([statusHeadingContainer, buttonContainer])
			.withLayout({ flexFlow: 'column', })
			.component();

		this._migrationStatusCardsContainer = view.modelBuilder.flexContainer()
			.withLayout({
				flexFlow: 'column',
				height: '272px',
			})
			.withProps({ CSSStyles: { 'overflow': 'hidden auto' } })
			.component();

		await this._updateSummaryStatus();

		// in progress
		this._inProgressMigrationButton = this.createStatusCard(
			IconPathHelper.inProgressMigration,
			loc.MIGRATION_IN_PROGRESS);
		this._disposables.push(
			this._inProgressMigrationButton.container.onDidClick(async (e) => {
				const dialog = new MigrationStatusDialog(
					this._context,
					AdsMigrationStatus.ONGOING,
					this.onDialogClosed);
				await dialog.initialize();
			}));

		this._migrationStatusCardsContainer.addItem(
			this._inProgressMigrationButton.container,
			{ flex: '0 0 auto' });

		// in progress warning
		this._inProgressWarningMigrationButton = this.createStatusCard(
			IconPathHelper.inProgressMigration,
			loc.MIGRATION_IN_PROGRESS,
			true);
		this._disposables.push(
			this._inProgressWarningMigrationButton.container.onDidClick(async (e) => {
				const dialog = new MigrationStatusDialog(
					this._context,
					AdsMigrationStatus.ONGOING,
					this.onDialogClosed);
				await dialog.initialize();
			}));

		this._migrationStatusCardsContainer.addItem(
			this._inProgressWarningMigrationButton.container,
			{ flex: '0 0 auto' });

		// successful
		this._successfulMigrationButton = this.createStatusCard(
			IconPathHelper.completedMigration,
			loc.MIGRATION_COMPLETED);
		this._disposables.push(
			this._successfulMigrationButton.container.onDidClick(async (e) => {
				const dialog = new MigrationStatusDialog(
					this._context,
					AdsMigrationStatus.SUCCEEDED,
					this.onDialogClosed);
				await dialog.initialize();
			}));
		this._migrationStatusCardsContainer.addItem(
			this._successfulMigrationButton.container,
			{ flex: '0 0 auto' });

		// completing
		this._completingMigrationButton = this.createStatusCard(
			IconPathHelper.completingCutover,
			loc.MIGRATION_CUTOVER_CARD);
		this._disposables.push(
			this._completingMigrationButton.container.onDidClick(async (e) => {
				const dialog = new MigrationStatusDialog(
					this._context,
					AdsMigrationStatus.COMPLETING,
					this.onDialogClosed);
				await dialog.initialize();
			}));
		this._migrationStatusCardsContainer.addItem(
			this._completingMigrationButton.container,
			{ flex: '0 0 auto' });

		// failed
		this._failedMigrationButton = this.createStatusCard(
			IconPathHelper.error,
			loc.MIGRATION_FAILED);
		this._disposables.push(
			this._failedMigrationButton.container.onDidClick(async (e) => {
				const dialog = new MigrationStatusDialog(
					this._context,
					AdsMigrationStatus.FAILED,
					this.onDialogClosed);
				await dialog.initialize();
			}));
		this._migrationStatusCardsContainer.addItem(
			this._failedMigrationButton.container,
			{ flex: '0 0 auto' });

		// all migrations
		this._allMigrationButton = this.createStatusCard(
			IconPathHelper.view,
			loc.VIEW_ALL);
		this._disposables.push(
			this._allMigrationButton.container.onDidClick(async (e) => {
				const dialog = new MigrationStatusDialog(
					this._context,
					AdsMigrationStatus.ALL,
					this.onDialogClosed);
				await dialog.initialize();
			}));
		this._migrationStatusCardsContainer.addItem(
			this._allMigrationButton.container,
			{ flex: '0 0 auto' });

		this._migrationStatusCardLoadingContainer = view.modelBuilder.loadingComponent()
			.withItem(this._migrationStatusCardsContainer)
			.component();
		statusContainer.addItem(header, { CSSStyles: { 'margin-bottom': '10px' } });
		statusContainer.addItem(this._selectServiceText, {});
		statusContainer.addItem(this._migrationStatusCardLoadingContainer, {});
		return statusContainer;
	}

	private async _updateSummaryStatus(): Promise<void> {
		const serviceContext = await MigrationLocalStorage.getMigrationServiceContext();
		const isContextValid = isServiceContextValid(serviceContext);
		await this._selectServiceText.updateCssStyles({ 'display': isContextValid ? 'none' : 'block' });
		await this._migrationStatusCardsContainer.updateCssStyles({ 'visibility': isContextValid ? 'visible' : 'hidden' });
		this._refreshButton.enabled = isContextValid;
	}

	private async createServiceSelector(view: azdata.ModelView): Promise<azdata.Component> {
		const serviceContextLabel = await getSelectedServiceStatus();
		this._serviceContextButton = view.modelBuilder.button()
			.withProps({
				iconPath: IconPathHelper.sqlMigrationService,
				iconHeight: 22,
				iconWidth: 22,
				label: serviceContextLabel,
				title: serviceContextLabel,
				description: loc.MIGRATION_SERVICE_DESCRIPTION,
				buttonType: azdata.ButtonType.Informational,
				width: 375,
				CSSStyles: { ...BUTTON_CSS },
			})
			.component();

		this._disposables.push(
			this._serviceContextButton.onDidClick(async () => {
				const dialog = new SelectMigrationServiceDialog(this.onDialogClosed);
				await dialog.initialize();
			}));

		return this._serviceContextButton;
	}

	private createVideoLinks(view: azdata.ModelView): azdata.Component {
		const linksContainer = view.modelBuilder.flexContainer()
			.withLayout({
				flexFlow: 'column',
				width: '440px',
				height: '385px',
				justifyContent: 'flex-start',
			}).withProps({
				CSSStyles: {
					'border': '1px solid rgba(0, 0, 0, 0.1)',
					'padding': '10px',
					'overflow': 'scroll',
				}
			}).component();
		const titleComponent = view.modelBuilder.text().withProps({
			value: loc.HELP_TITLE,
			CSSStyles: {
				...styles.SECTION_HEADER_CSS
			}
		}).component();

		linksContainer.addItems([titleComponent], {
			CSSStyles: {
				'margin-bottom': '16px'
			}
		});

		const links = [
			{
				title: localize('sql.migration.dashboard.help.link.migrateUsingADS', 'Migrate databases using Azure Data Studio'),
				description: localize('sql.migration.dashboard.help.description.migrateUsingADS', 'The Azure SQL Migration extension for Azure Data Studio provides capabilities to assess, get right-sized Azure recommendations and migrate SQL Server databases to Azure.'),
				link: 'https://docs.microsoft.com/azure/dms/migration-using-azure-data-studio'
			},
			{
				title: localize('sql.migration.dashboard.help.link.mi', 'Tutorial:  Migrate to Azure SQL Managed Instance (online)'),
				description: localize('sql.migration.dashboard.help.description.mi', 'A step-by-step tutorial to migrate databases from a SQL Server instance (on-premises or Azure Virtual Machines) to Azure SQL Managed Instance with minimal downtime.'),
				link: 'https://docs.microsoft.com/azure/dms/tutorial-sql-server-managed-instance-online-ads'
			},
			{
				title: localize('sql.migration.dashboard.help.link.vm', 'Tutorial:  Migrate to SQL Server on Azure Virtual Machines (online)'),
				description: localize('sql.migration.dashboard.help.description.vm', 'A step-by-step tutorial to migrate databases from a SQL Server instance (on-premises) to SQL Server on Azure Virtual Machines with minimal downtime.'),
				link: 'https://docs.microsoft.com/azure/dms/tutorial-sql-server-to-virtual-machine-online-ads'
			},
			{
				title: localize('sql.migration.dashboard.help.link.dmsGuide', 'Azure Database Migration Guides'),
				description: localize('sql.migration.dashboard.help.description.dmsGuide', 'A hub of migration articles that provides step-by-step guidance for migrating and modernizing your data assets in Azure.'),
				link: 'https://docs.microsoft.com/data-migration/'
			},
		];

		linksContainer.addItems(links.map(l => this.createLink(view, l)), {});

		const videoLinks: IActionMetadata[] = [];
		const videosContainer = view.modelBuilder.flexContainer().withLayout({
			flexFlow: 'row',
			width: maxWidth,
		}).component();
		videosContainer.addItems(videoLinks.map(l => this.createVideoLink(view, l)), {});
		linksContainer.addItem(videosContainer);

		return linksContainer;
	}

	private createLink(view: azdata.ModelView, linkMetaData: IActionMetadata): azdata.Component {
		const maxWidth = 400;
		const labelsContainer = view.modelBuilder.flexContainer().withProps({
			CSSStyles: {
				'flex-direction': 'column',
				'width': `${maxWidth}px`,
				'justify-content': 'flex-start',
				'margin-bottom': '12px'
			}
		}).component();
		const linkContainer = view.modelBuilder.flexContainer().withProps({
			CSSStyles: {
				'flex-direction': 'row',
				'width': `${maxWidth}px`,
				'justify-content': 'flex-start',
				'margin-bottom': '4px'
			}

		}).component();
		const descriptionComponent = view.modelBuilder.text().withProps({
			value: linkMetaData.description,
			width: maxWidth,
			CSSStyles: {
				...styles.NOTE_CSS
			}
		}).component();
		const linkComponent = view.modelBuilder.hyperlink().withProps({
			label: linkMetaData.title!,
			url: linkMetaData.link!,
			showLinkIcon: true,
			CSSStyles: {
				...styles.BODY_CSS
			}
		}).component();
		linkContainer.addItem(linkComponent);
		labelsContainer.addItems([linkContainer, descriptionComponent]);
		return labelsContainer;
	}

	private createVideoLink(view: azdata.ModelView, linkMetaData: IActionMetadata): azdata.Component {
		const maxWidth = 150;
		const videosContainer = view.modelBuilder.flexContainer().withLayout({
			flexFlow: 'column',
			width: maxWidth,
			justifyContent: 'flex-start'
		}).component();
		const video1Container = view.modelBuilder.divContainer().withProps({
			clickable: true,
			width: maxWidth,
			height: '100px'
		}).component();
		const descriptionComponent = view.modelBuilder.text().withProps({
			value: linkMetaData.description,
			width: maxWidth,
			height: '50px',
			CSSStyles: {
				...styles.BODY_CSS
			}
		}).component();
		this._disposables.push(
			video1Container.onDidClick(async () => {
				if (linkMetaData.link) {
					await vscode.env.openExternal(vscode.Uri.parse(linkMetaData.link));
				}
			}));
		videosContainer.addItem(video1Container, {
			CSSStyles: {
				'background-image': `url(${vscode.Uri.file(<string>linkMetaData.iconPath?.light)})`,
				'background-repeat': 'no-repeat',
				'background-position': 'top',
				'width': `${maxWidth}px`,
				'height': '104px',
				'background-size': `${maxWidth}px 120px`
			}
		});
		videosContainer.addItem(descriptionComponent);
		return videosContainer;
	}
}