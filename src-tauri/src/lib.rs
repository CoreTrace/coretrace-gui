mod analysis;
mod cloud;
mod cloud_run;
mod github;
mod pack;
mod settings;
mod workspace;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(workspace::WorkspaceState::default())
        .manage(analysis::AnalysisState::default())
        .manage(cloud::Cloud::new().expect("invalid CoreTrace platform configuration"))
        .manage(cloud_run::RunState::default())
        .invoke_handler(tauri::generate_handler![
            workspace::choose_workspace,
            workspace::workspaces,
            settings::restore_session,
            workspace::close_workspace,
            workspace::list_files,
            workspace::read_file,
            workspace::save_file,
            github::clone_repository,
            github::clone_location,
            analysis::choose_analyser,
            analysis::analysis_options,
            analysis::choose_analysis_file,
            analysis::analyse_local,
            analysis::analyse_local_folder,
            analysis::probe_tools,
            settings::local_history,
            workspace::list_all_files,
            github::cloned_repositories,
            analysis::cancel_local,
            cloud::cloud_status,
            cloud::login_start,
            cloud::login_poll,
            cloud::login_cancel,
            cloud::logout,
            cloud::cloud_read,
            cloud::cloud_analyse,
            cloud::cloud_cancel,
            cloud::cloud_report,
            cloud::connect_github,
            cloud_run::cloud_run_start,
            cloud_run::cloud_run_status,
            cloud_run::cloud_run_confirm,
            cloud_run::cloud_run_cancel,
            cloud::open_account,
        ])
        .run(tauri::generate_context!())
        .expect("failed to start CoreTrace desktop");
}
